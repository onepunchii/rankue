import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:convert';
import 'dart:math';
import 'dart:async';
import '../../shared/models/shot_data.dart';
import '../../shared/widgets/solution_widgets.dart';
import 'table_painter.dart';
import 'trajectory_painter.dart';

enum SimulationMode { setup, result }

class SimulationPage extends StatefulWidget {
  const SimulationPage({super.key});

  @override
  State<SimulationPage> createState() => _SimulationPageState();
}

class _SimulationPageState extends State<SimulationPage> with SingleTickerProviderStateMixin {
  SimulationMode _mode = SimulationMode.setup;
  ShotData? currentShot;
  List<ShotData> recommendedSolutions = [];
  int activeSolutionIndex = 0;
  List<ShotData> db = [];
  bool isLoading = true;
  bool _showGrid = false;
  String _activeBallType = 'white';
  
  // Custom Ball Setup (Source: 500x250 space)
  final Map<String, Offset> _userPositions = {
    'white': const Offset(250, 187.5),
    'yellow': const Offset(250, 62.5),
    'red': const Offset(125, 62.5),
  };

  // Playback State
  int _currentFrame = 0;
  bool _isPlaying = false;
  bool _isCueVisible = false;
  double _cueAngle = 0;
  double _cueOffset = 15;
  Timer? _timer;

  // Animation for UI Transition
  late AnimationController _panelController;
  late Animation<Offset> _panelSlideAnimation;

  @override
  void initState() {
    super.initState();
    _panelController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _panelSlideAnimation = Tween<Offset>(
      begin: const Offset(0, 1),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _panelController, curve: Curves.easeOutCubic));
    
    _loadData();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _panelController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    try {
      final String response = await rootBundle.loadString('assets/data/shot_data.json');
      final List<dynamic> data = json.decode(response);
      setState(() {
        db = data.map((i) => ShotData.fromJson(i)).toList();
        isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading DB: $e");
      setState(() => isLoading = false);
    }
  }

  void _findBestMatch() {
    if (db.isEmpty) return;

    List<MapEntry<double, ShotData>> scores = [];

    for (var shot in db) {
      final dWhite = (shot.balls['white']![0] - _userPositions['white']!).distance;
      final dYellow = (shot.balls['yellow']![0] - _userPositions['yellow']!).distance;
      final dRed = (shot.balls['red']![0] - _userPositions['red']!).distance;
      
      final totalDist = (dWhite + dYellow + dRed) / 3;
      scores.add(MapEntry(totalDist, shot));
    }

    // Sort by distance and take top 3
    scores.sort((a, b) => a.key.compareTo(b.key));
    final top3 = scores.take(3).map((e) => e.value).toList();

    if (top3.isNotEmpty) {
      setState(() {
        recommendedSolutions = top3;
      });
      _selectSolution(top3[0], 0);
    }
  }

  void _selectSolution(ShotData shot, int index) {
    setState(() {
      currentShot = shot;
      activeSolutionIndex = index;
      _mode = SimulationMode.result;
      _currentFrame = 0;
      
      // Keep ball at current user position (Adaptive Trajectory)
      // No more snapping to DB positions here.
      
      if (!_panelController.isAnimating && _panelController.value == 0) {
        _panelController.forward();
      }
    });
    // Removed auto-playback: wait for user to press Play
  }

  void _startPlayback() {
    if (currentShot == null) return;
    _timer?.cancel();
    
    // Calculate Cue Angle based on initial trajectory
    final whitePath = currentShot!.paths['white'] ?? currentShot!.paths['cue'] ?? [];
    if (whitePath.isEmpty) {
      _runReplayLoop();
      return;
    }
    
    double dx = 0;
    double dy = 0;
    if (whitePath.length >= 2) {
      dx = whitePath[1].x - whitePath[0].x;
      dy = whitePath[1].y - whitePath[0].y;
    }
    final double cueAngle = atan2(dy, dx);
    
    setState(() {
      _isPlaying = true;
      _isCueVisible = true;
      _cueAngle = cueAngle;
      _cueOffset = 15;
      _currentFrame = 0;
    });

    final cueStopwatch = Stopwatch()..start();
    _timer = Timer.periodic(const Duration(milliseconds: 16), (timer) {
      final cueElapsed = cueStopwatch.elapsedMilliseconds;
      if (cueElapsed < 300) {
        setState(() {
          // 0.3s swing animation
          _cueOffset = 15 + sin((cueElapsed / 300) * pi) * 40;
        });
      } else {
        timer.cancel();
        setState(() {
          _isCueVisible = false;
        });
        // Impact Feedback
        HapticFeedback.lightImpact();
        _runReplayLoop();
      }
    });
  }

  void _runReplayLoop() {
    final maxTime = _getMaxTime();
    final stopwatch = Stopwatch()..start();
    
    _timer = Timer.periodic(const Duration(milliseconds: 16), (timer) {
      if (mounted) {
        const double playbackSpeed = 0.1;
        final elapsed = stopwatch.elapsedMilliseconds * playbackSpeed;
        setState(() {
          if (elapsed <= maxTime + 500) {
            _currentFrame = elapsed.toInt();
          } else {
            _stopPlayback();
          }
        });
      }
    });
  }

  void _stopPlayback() {
    _timer?.cancel();
    setState(() => _isPlaying = false);
  }

  int _getMaxTime() {
    if (currentShot == null) return 0;
    double maxT = 0;
    currentShot!.paths.forEach((key, list) {
      for (var f in list) {
        if (f.t > maxT) maxT = f.t;
      }
    });
    return maxT.toInt();
  }

  Point<double> _getBallPosAtFrame(String color) {
    if (_mode == SimulationMode.setup) {
      final off = _userPositions[color]!;
      return Point(off.dx, off.dy);
    }
    
    // Result Mode: Apply Adaptation Offset
    String pathKey = color;
    if (color == 'white' && !currentShot!.paths.containsKey('white')) {
      pathKey = 'cue';
    } else if (color == 'yellow' && !currentShot!.paths.containsKey('yellow')) {
      pathKey = 'red'; 
    } else if (color == 'red' && !currentShot!.paths.containsKey('red')) {
      pathKey = 'red2';
    }

    final path = currentShot!.paths[pathKey] ?? [];
    
    if (path.isEmpty) {
      final off = _userPositions[color]!;
      return Point(off.dx, off.dy);
    }

    // Find the frame that should be active at 'elapsed' time (stored in _currentFrame)
    final double elapsed = _currentFrame.toDouble();
    BallFrame activeFrame = path[0];
    for (int i = path.length - 1; i >= 0; i--) {
      if (path[i].t <= elapsed) {
        activeFrame = path[i];
        break;
      }
    }

    final dbStart = path[0];
    final userStart = _userPositions[color]!;
    final double offsetDx = userStart.dx - dbStart.x;
    final double offsetDy = userStart.dy - dbStart.y;

    // Clamp positions to keep balls within the table area (0~500, 0~250)
    final double clampedX = (activeFrame.x + offsetDx).clamp(0.0, 500.0);
    final double clampedY = (activeFrame.y + offsetDy).clamp(0.0, 250.0);

    return Point(clampedX, clampedY);
  }

  @override
  Widget build(BuildContext context) {
    if (isLoading) return const Scaffold(backgroundColor: Color(0xFF1A1A1A), body: Center(child: CircularProgressIndicator(color: Colors.white24)));

    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      body: SafeArea(
        child: Column(
          children: [
            // 1. Header (Back Button & Grid)
            _buildHeader(),

            // 2. Table Area (Top 1/2)
            _buildTableArea(),

            // 3. Control Area (Bottom 1/2)
            Expanded(
              child: Stack(
                children: [
                  // Setup Panel
                  if (_mode == SimulationMode.setup) _buildSetupPanel(),
                  
                  // Result Dashboard (Slides over Setup)
                  SlideTransition(
                    position: _panelSlideAnimation,
                    child: _buildResultDashboard(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.arrow_back, color: Colors.white),
          ),
          const Text("AI 공략 추천", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(width: 48), // Spacer for centering title
        ],
      ),
    );
  }

  Widget _buildTableArea() {
    return AspectRatio(
      aspectRatio: 1.7399, // 플레이 영역 2:1을 유지하기 위한 컨테이너 비율 (W/H = 1.7399)
      child: LayoutBuilder(
        builder: (context, constraints) {
          final double w = constraints.maxWidth;
          final double h = constraints.maxHeight;
          
          // 정밀 패딩 복구 및 밸런싱 (가로 5.4%, 세로 11.2%)
          final double hPadding = w * 0.054;
          final double vPadding = h * 0.112;
          final double playW = w - 2 * hPadding;
          final double playH = h - 2 * vPadding;

          // 공 크기 보정 (지름이 플레이 영역 가로폭의 1/48, 즉 반경은 1/96)
          final double ballRadius = playW / 96.0;

          // 공의 가장자리(Edge)가 쿠션에 닿도록 오프셋을 포함한 매핑
          double mapX(double dataX) => hPadding + ballRadius + (dataX / 500.0) * (playW - 2 * ballRadius);
          double mapY(double dataY) => vPadding + ballRadius + (dataY / 250.0) * (playH - 2 * ballRadius);

          return Stack(
            children: [
              // Layer 1: Base Frame (Removed Grey Background)
              Container(
                width: w,
                height: h,
                color: Colors.transparent,
              ),

              // Layer 2: Playing Cloth (Premium Felt with Vignette)
              Padding(
                padding: EdgeInsets.symmetric(horizontal: hPadding, vertical: vPadding),
                child: Container(
                  width: playW,
                  height: playH,
                  decoration: const BoxDecoration(
                    color: Color(0xFF2E7D32),
                    gradient: RadialGradient(
                      center: Alignment.center,
                      radius: 1.2,
                      colors: [
                        Color(0xFF2E7D32), // Center: Bright Green
                        Color(0xFF1B5E20), // Mid: Deeper Green
                        Color(0xFF0A3311), // Edge: Dark Forest Green
                      ],
                      stops: [0.0, 0.7, 1.0],
                    ),
                  ),
                ),
              ),

              // Layer 3: The Blueprint Overlay (With 2.5% Squash)
              Positioned(
                top: h * 0.0125, 
                left: 0,
                width: w,
                height: h * 0.975,
                child: Image.asset(
                  'assets/images/당구대.png',
                  fit: BoxFit.fill,
                ),
              ),

              // Optional Grid
              if (_showGrid)
                CustomPaint(
                  size: Size(w, h),
                  painter: GridOverlayPainter(rect: Rect.fromLTWH(hPadding, vPadding, playW, playH)),
                ),

              // Crosshair Guide (Only for Active Ball in Setup Mode)
              if (_mode == SimulationMode.setup)
                _buildCrosshairs(mapX(_userPositions[_activeBallType]!.dx), mapY(_userPositions[_activeBallType]!.dy), w, h, Rect.fromLTWH(hPadding, vPadding, playW, playH)),

              // Trajectory Ghost (Result Mode)
              if (_mode == SimulationMode.result && currentShot != null)
                CustomPaint(
                  size: Size(w, h), 
                  painter: TrajectoryPainter(
                    shot: currentShot!, 
                    userPositions: _userPositions,
                    showOnlyCue: !_isPlaying,
                  )
                ),

              // Cue Stick Layer (Before/During strike)
              if (_isCueVisible)
                CustomPaint(
                  size: Size(w, h),
                  painter: CuePainter(
                    ballPos: Offset(mapX(_getBallPosAtFrame('white').x), mapY(_getBallPosAtFrame('white').y)),
                    angle: _cueAngle,
                    offset: _cueOffset,
                    tableWidth: playW,
                  ),
                ),
              
              // Balls
              ...['white', 'yellow', 'red'].map((color) {
                final pos = _getBallPosAtFrame(color);
                final isActive = _mode == SimulationMode.setup && _activeBallType == color;
                
                // Color mapping for premium look
                final baseColor = color == 'white' ? const Color(0xFFFDFDFD) : (color == 'yellow' ? const Color(0xFFFFD54F) : const Color(0xFFEF5350));
                final darkColor = color == 'white' ? const Color(0xFFE0E0E0) : (color == 'yellow' ? const Color(0xFFF9A825) : const Color(0xFFB71C1C));

                return Positioned(
                  left: mapX(pos.x) - ballRadius,
                  top: mapY(pos.y) - ballRadius,
                  child: Container(
                    width: ballRadius * 2,
                    height: ballRadius * 2,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      // Black Border (5% of diameter = 10% of radius)
                      border: Border.all(color: const Color(0xFF111111), width: ballRadius * 0.1),
                      gradient: RadialGradient(
                        center: const Alignment(-0.35, -0.35),
                        radius: 0.8,
                        colors: [baseColor, darkColor],
                        stops: const [0.1, 1.0],
                      ),
                      boxShadow: [
                        BoxShadow(blurRadius: 4, color: Colors.black.withOpacity(0.5), offset: const Offset(1, 1)),
                        if (isActive) BoxShadow(blurRadius: 12, color: Colors.blue.withOpacity(0.5), spreadRadius: 2),
                      ],
                    ),
                    child: Center(
                      // Inner highlight for extra gloss
                      child: Container(
                        margin: EdgeInsets.all(ballRadius * 0.3),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            center: const Alignment(-0.35, -0.35),
                            radius: 0.5,
                            colors: [Colors.white.withOpacity(0.4), Colors.white.withOpacity(0)],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ],
          );
        }
      ),
    );
  }

  Widget _buildCrosshairs(double x, double y, double w, double h) {
    return CustomPaint(
      size: Size(w, h),
      painter: CrosshairPainter(x: x, y: y),
    );
  }

  Widget _buildSetupPanel() {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onPanUpdate: (details) {
        // Indirect Relative Movement Logic
        setState(() {
          final double sensitivity = 0.5; 
          final delta = details.delta * sensitivity;
          
          final currentOff = _userPositions[_activeBallType]!;
          
          // Dragging range is full 0~500 units. mapX handles the cushion offset.
          final newX = (currentOff.dx + delta.dx).clamp(0.0, 500.0);
          final newY = (currentOff.dy + delta.dy).clamp(0.0, 250.0);
          _userPositions[_activeBallType] = Offset(newX, newY);
        });
      },
      child: Stack(
        children: [
          // Background Central Instruction
          const Center(
            child: Opacity(
              opacity: 0.35,
              child: Text(
                "빈 공간을 드래그하여 공을 옮기세요",
                style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 1.5),
              ),
            ),
          ),
          // Foreground Controls
          Column(
            children: [
              const Spacer(),
              // 1. Ball Selectors
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: ['white', 'yellow', 'red'].map((type) {
                  final isSelected = _activeBallType == type;
                  final label = type == 'white' ? '수구' : (type == 'yellow' ? '1적구' : '2적구');
                  
                  // Color mapping for premium bulb look
                  final baseColor = type == 'white' ? const Color(0xFFFDFDFD) : (type == 'yellow' ? const Color(0xFFFFD54F) : const Color(0xFFEF5350));
                  final darkColor = type == 'white' ? const Color(0xFFE0E0E0) : (type == 'yellow' ? const Color(0xFFF9A825) : const Color(0xFFB71C1C));

                  return GestureDetector(
                    onTap: () => setState(() => _activeBallType = type),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // 3D Ball Icon (Smaller)
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 300),
                            width: isSelected ? 35 : 30,
                            height: isSelected ? 35 : 30,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: RadialGradient(
                                center: const Alignment(-0.3, -0.3),
                                radius: 0.8,
                                colors: [baseColor, darkColor],
                              ),
                              boxShadow: [
                                BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 4, offset: const Offset(1, 2)),
                              ],
                            ),
                          ),
                          const SizedBox(height: 10),
                          // Clean Button Label
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 300),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: isSelected ? const Color(0xFF3B82F6) : Colors.white.withOpacity(0.05),
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: [
                                if (isSelected) 
                                  BoxShadow(color: const Color(0xFF3B82F6).withOpacity(0.4), blurRadius: 12, spreadRadius: 1),
                              ],
                              border: Border.all(
                                color: isSelected ? const Color(0xFF3B82F6) : Colors.white.withOpacity(0.05),
                                width: 1,
                              ),
                            ),
                            child: Text(
                              label,
                              style: TextStyle(
                                color: isSelected ? Colors.white : Colors.white24,
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 24, vertical: 24),
                child: Text(
                  "현재 배치에서 3,000개의 족보 데이터를 기반으로\n가장 높은 확률의 정답을 찾아냅니다.",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white60, fontSize: 11, height: 1.5, fontWeight: FontWeight.w500),
                ),
              ),
              // 2. Large Search Button
              SizedBox(
                width: double.infinity,
                height: 65,
                child: ElevatedButton.icon(
                  onPressed: _findBestMatch,
                  icon: const Icon(Icons.track_changes, size: 24),
                  label: const Text("최적 공략 검색", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 0.5)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.black,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    elevation: 8,
                    shadowColor: Colors.white.withOpacity(0.2),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildResultDashboard() {
    if (currentShot == null) return Container();

    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF252525),
        borderRadius: BorderRadius.only(topLeft: Radius.circular(40), topRight: Radius.circular(40)),
        boxShadow: [BoxShadow(blurRadius: 30, color: Colors.black54)],
      ),
      padding: const EdgeInsets.all(32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("AI 추천 공략", style: TextStyle(color: Color(0xFF4A90E2), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
          const SizedBox(height: 12),
          // Recommended Options Grid
          Row(
            children: List.generate(recommendedSolutions.length, (index) {
              final sol = recommendedSolutions[index];
              final isSelected = activeSolutionIndex == index;
              return Expanded(
                child: GestureDetector(
                  onTap: () => _selectSolution(sol, index),
                  child: Container(
                    margin: EdgeInsets.only(right: index == 2 ? 0 : 8),
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                    decoration: BoxDecoration(
                      color: isSelected ? const Color(0xFF4A90E2) : Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: isSelected ? [BoxShadow(color: const Color(0xFF4A90E2).withOpacity(0.3), blurRadius: 10)] : null,
                    ),
                    child: Column(
                      children: [
                        Text("OPTION ${index + 1}", style: TextStyle(color: isSelected ? Colors.white70 : Colors.white24, fontSize: 8, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        Text(
                          (sol.title == 'Unknown' || sol.title.isEmpty) ? "추천 공략" : sol.title,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: isSelected ? Colors.white : Colors.white54, fontSize: 10, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 24),
          Text(
            (currentShot!.title.isEmpty || currentShot!.title == 'Unknown') ? 'AI 추천 공략' : currentShot!.title, 
            style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)
          ),
          if (currentShot!.description.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(currentShot!.description, style: const TextStyle(color: Colors.white38, fontSize: 12)),
          ],
          const SizedBox(height: 24),
          // Visual Guide
          Row(
            children: [
              Expanded(child: SpinVisualizer(spin: currentShot!.solution.spin)),
              const SizedBox(width: 20),
              Expanded(child: ThicknessVisualizer(thickness: currentShot!.solution.thickness)),
              const SizedBox(width: 20),
              PowerGauge(power: currentShot!.solution.power),
            ],
          ),
          const SizedBox(height: 24),
          // Text Tip
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
            child: Text(currentShot!.tip, style: const TextStyle(color: Colors.white70, height: 1.5)),
          ),
          const Spacer(),
          // Buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _startPlayback,
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.white24),
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text("다시 보기", style: TextStyle(color: Colors.white)),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: ElevatedButton(
                  onPressed: () {
                    _panelController.reverse().then((_) {
                      setState(() => _mode = SimulationMode.setup);
                    });
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF4A90E2),
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text("배치 수정", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class GridOverlayPainter extends CustomPainter {
  final Rect rect;
  GridOverlayPainter({required this.rect});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withOpacity(0.1)
      ..strokeWidth = 0.5;

    final double step = rect.width / 8;
    for (int i = 1; i < 8; i++) {
        double x = rect.left + i * step;
        canvas.drawLine(Offset(x, rect.top), Offset(x, rect.bottom), paint);
    }
    for (int i = 1; i < 4; i++) {
        double y = rect.top + i * step;
        canvas.drawLine(Offset(rect.left, y), Offset(rect.right, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant GridOverlayPainter oldDelegate) => false;
}

class CuePainter extends CustomPainter {
  final Offset ballPos;
  final double angle;
  final double offset; 
  final double tableWidth;

  CuePainter({required this.ballPos, required this.angle, required this.offset, required this.tableWidth});

  @override
  void paint(Canvas canvas, Size size) {
    final double cueLength = tableWidth * 0.45;
    final double cueWidth = tableWidth * 0.012;

    final paint = Paint()
      ..shader = LinearGradient(
        colors: [const Color(0xFFE0C090), const Color(0xFF5D4037), const Color(0xFF212121)],
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
      ).createShader(Rect.fromLTWH(0, 0, cueLength, cueWidth))
      ..style = PaintingStyle.fill;

    canvas.save();
    canvas.translate(ballPos.dx, ballPos.dy);
    canvas.rotate(angle + pi); 
    canvas.translate(offset, -cueWidth / 2); 
    
    final RRect rrect = RRect.fromLTRBR(0, 0, cueLength, cueWidth, Radius.circular(cueWidth / 2));
    
    // Shadow
    canvas.drawRRect(rrect.shift(const Offset(2, 4)), Paint()..color = Colors.black.withOpacity(0.4)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4));
    
    canvas.drawRRect(rrect, paint);
    
    // Tip Detail
    final tipPaint = Paint()..color = Colors.blue.withOpacity(0.8)..style = PaintingStyle.fill;
    canvas.drawRRect(RRect.fromLTRBR(0, 0, cueLength * 0.04, cueWidth, const Radius.circular(1)), tipPaint);
    
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CuePainter oldDelegate) => 
      oldDelegate.ballPos != ballPos || oldDelegate.angle != angle || oldDelegate.offset != offset;
}

class CrosshairPainter extends CustomPainter {
  final double x, y;
  final Rect playArea;
  CrosshairPainter({required this.x, required this.y, required this.playArea});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.red.withOpacity(0.4)
      ..strokeWidth = 1.0;

    // 플레이 영역 내부까지만 십자선 그리기 (Cushion 경계 준수)
    canvas.drawLine(Offset(x, playArea.top), Offset(x, playArea.bottom), paint);
    canvas.drawLine(Offset(playArea.left, y), Offset(playArea.right, y), paint);
  }

  @override
  bool shouldRepaint(covariant CrosshairPainter oldDelegate) => 
    oldDelegate.x != x || oldDelegate.y != y || oldDelegate.playArea != playArea;
}
