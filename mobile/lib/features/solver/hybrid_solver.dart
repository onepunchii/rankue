import 'dart:math';
import '../../shared/models/shot_data.dart';

class HybridSolver {
  final List<ShotData> referenceDB;

  HybridSolver(this.referenceDB);

  /// Find the best match from the DB using Euclidean distance of ball positions.
  /// Threshold is 5% error margin.
  ShotData? findDBMatch(Map<String, Point<double>> userBalls) {
    ShotData? bestMatch;
    double minDistance = double.infinity;

    for (var shot in referenceDB) {
      double totalDist = 0;
      bool allBallsPresent = true;

      userBalls.forEach((color, userPos) {
        var dbPos = shot.balls[color];
        if (dbPos == null) {
          allBallsPresent = false;
        } else {
          double dx = userPos.x - dbPos.x;
          double dy = userPos.y - dbPos.y;
          totalDist += sqrt(dx * dx + dy * dy);
        }
      });

      if (allBallsPresent && totalDist < minDistance) {
        minDistance = totalDist;
        bestMatch = shot;
      }
    }

    // Threshold: 0.05 * sqrt(1^2 + 0.5^2) roughly for 5%
    if (minDistance < 0.1) {
      return bestMatch;
    }
    return null;
  }

  /// AI Fallback: Generate a weighted solution from top 3 closest matches
  Solution generateAISolution(Map<String, Point<double>> userBalls) {
    // Sort all DB items by distance
    List<MapEntry<ShotData, double>> matches = referenceDB.map((shot) {
      double totalDist = 0;
      userBalls.forEach((color, userPos) {
        var dbPos = shot.balls[color];
        if (dbPos != null) {
          double dx = userPos.x - dbPos.x;
          double dy = userPos.y - dbPos.y;
          totalDist += sqrt(dx * dx + dy * dy);
        }
      });
      return MapEntry(shot, totalDist);
    }).toList();

    matches.sort((a, b) => a.value.compareTo(b.value));

    // Take top 3 and average them (weighted by inverse distance)
    double weightedThickness = 0;
    double weightedSpinX = 0;
    double weightedSpinY = 0;
    double weightedPower = 0;
    double totalWeight = 0;

    for (int i = 0; i < min(3, matches.length); i++) {
      double weight = 1.0 / (matches[i].value + 0.001);
      var solution = matches[i].key.solution;
      
      weightedThickness += solution.thickness * weight;
      weightedSpinX += solution.spin.x * weight;
      weightedSpinY += solution.spin.y * weight;
      weightedPower += solution.power * weight;
      totalWeight += weight;
    }

    return Solution(
      thickness: weightedThickness / totalWeight,
      spin: Point(weightedSpinX / totalWeight, weightedSpinY / totalWeight),
      power: weightedPower / totalWeight,
    );
  }
}
