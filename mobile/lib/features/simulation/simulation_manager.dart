import 'package:flutter/material.dart';
import '../../shared/models/shot_data.dart';
import '../solver/hybrid_solver.dart';
import '../../core/physics/billiard_game.dart';

/// The central brain of the HiQ simulation.
/// Coordinates between Reference DB, AI Solver, and the Physics Engine.
class HiQSimulationManager extends ChangeNotifier {
  final List<ShotData> db;
  final HybridSolver solver;
  final BilliardGame game;

  ShotData? _currentShot;
  bool _isLiveMode = false;

  HiQSimulationManager({
    required this.db,
    required this.game,
  }) : solver = HybridSolver(db);

  ShotData? get currentShot => _currentShot;
  bool get isLiveMode => _isLiveMode;

  /// Automatically categorize shot based on description
  String get shotCategory {
    final desc = _currentShot?.title ?? "";
    if (desc.contains("뒤돌리기")) return "뒤돌리기";
    if (desc.contains("옆돌리기")) return "옆돌리기";
    if (desc.contains("앞돌리기")) return "앞돌리기";
    if (desc.contains("비껴치기")) return "비껴치기";
    if (desc.contains("세워치기")) return "세워치기";
    if (desc.contains("뱅크샷")) return "뱅크샷";
    return "기타";
  }

  void loadShot(ShotData shot) {
    _currentShot = shot;
    if (_isLiveMode) {
      game.resetTable(shot.balls);
    }
    notifyListeners();
  }

  void toggleMode() {
    _isLiveMode = !_isLiveMode;
    if (_isLiveMode && _currentShot != null) {
      game.resetTable(_currentShot!.balls);
    }
    notifyListeners();
  }

  /// AI-Powered matching for user-defined ball positions
  void solveForBalls(Map<String, Point<double>> userPositions) {
    final dbMatch = solver.findDBMatch(userPositions);
    if (dbMatch != null) {
      _currentShot = dbMatch;
    } else {
      final aiSolution = solver.generateAISolution(userPositions);
      _currentShot = ShotData(
        title: "AI Optimized Solution",
        balls: userPositions,
        paths: {}, // No path for AI yet
        solution: aiSolution,
        tip: "AI가 계산한 최적의 물리 경로입니다.",
        url: "",
      );
    }
    notifyListeners();
  }
}
