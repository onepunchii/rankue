import 'package:flutter/material.dart';
import '../../shared/models/shot_data.dart';

class TrajectoryPainter extends CustomPainter {
  final ShotData shot;
  final Map<String, Offset> userPositions;
  final bool showOnlyCue;
  
  TrajectoryPainter({
    required this.shot, 
    required this.userPositions,
    this.showOnlyCue = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final double hPadding = size.width * 0.054;
    final double vPadding = size.height * 0.112;
    final double playW = size.width - 2 * hPadding;
    final double playH = size.height - 2 * vPadding;
    final double ballRadius = playW / 96.0;

    double mapX(double dataX) => hPadding + ballRadius + (dataX / 500.0) * (playW - 2 * ballRadius);
    double mapY(double dataY) => vPadding + ballRadius + (dataY / 250.0) * (playH - 2 * ballRadius);

    void drawPath(List<BallFrame> path, Color color, bool isCue, String ballType) {
      if (path.isEmpty) return;
      if (showOnlyCue && !isCue) return;
      
      // Calculate individual offset for this ball to align path to current user position
      final dbStart = path[0];
      final userStart = userPositions[ballType]!;
      final double offsetDx = userStart.dx - dbStart.x;
      final double offsetDy = userStart.dy - dbStart.y;

      final paint = Paint()
        ..color = color.withOpacity(isCue ? 0.5 : 0.25)
        ..strokeWidth = isCue ? 2.0 : 1.2
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round;

      final p = Path();
      p.moveTo(mapX(path[0].x + offsetDx), mapY(path[0].y + offsetDy));

      for (int i = 1; i < path.length; i++) {
        p.lineTo(mapX(path[i].x + offsetDx), mapY(path[i].y + offsetDy));
      }
      
      canvas.drawPath(p, paint);

      // Draw destination ghost
      final endPaint = Paint()..color = color.withOpacity(isCue ? 0.3 : 0.15)..style = PaintingStyle.fill;
      canvas.drawCircle(Offset(mapX(path.last.x + offsetDx), mapY(path.last.y + offsetDy)), ballRadius * 0.8, endPaint);
    }

    if (shot.paths.containsKey('white')) drawPath(shot.paths['white']!, Colors.white, true, 'white');
    if (shot.paths.containsKey('cue')) drawPath(shot.paths['cue']!, Colors.white, true, 'white');
    
    // For object balls, we map DB keys to our userPositions keys
    if (shot.paths.containsKey('yellow')) drawPath(shot.paths['yellow']!, Colors.yellow, false, 'yellow');
    else if (shot.paths.containsKey('red') && shot.paths.containsKey('white')) drawPath(shot.paths['red']!, Colors.yellow, false, 'yellow');

    if (shot.paths.containsKey('red2')) drawPath(shot.paths['red2']!, Colors.red, false, 'red');
    else if (shot.paths.containsKey('red') && !shot.paths.containsKey('white')) drawPath(shot.paths['red']!, Colors.red, false, 'red');
  }

  @override
  bool shouldRepaint(covariant TrajectoryPainter oldDelegate) => 
      oldDelegate.shot != shot || oldDelegate.userPositions != userPositions;
}
