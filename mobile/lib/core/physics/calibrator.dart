import 'dart:math';
import '../models/shot_data.dart';
import 'constants.dart';

class PhysicsCalibrator {
  /// Analyzes DB data to find the initial velocity for a given power level.
  /// Power level in DB is usually 1-5.
  /// Returns velocity in meters per second.
  static double calculateInitialVelocity(ShotData shot) {
    if (shot.balls['white'] == null || shot.balls['white']!.length < 2) {
      return 0.0;
    }

    // Find the move start (first frame where position changes)
    var path = shot.balls['white']!;
    Point<double>? startPos;
    Point<double>? nextPos;
    
    // In our DB, sometimes the ball stays still for a few frames
    for (int i = 0; i < path.length - 1; i++) {
        if (path[i] != path[i+1]) {
            startPos = path[i];
            nextPos = path[i+1];
            break;
        }
    }

    if (startPos == null || nextPos == null) return 0.0;

    // Calculate pixel distance per frame
    double dx = (nextPos.x - startPos.x).abs();
    double dy = (nextPos.y - startPos.y).abs();
    double pixelDist = sqrt(dx * dx + dy * dy);
    
    // Normalization: DB coordinates are based on a 500x250 logical table
    // Scale to real world meters (2.844m width)
    double metersPerPixel = BilliardConstants.tableWidth / 500.0;
    double distInMeters = pixelDist * metersPerPixel;
    
    // Assume 60fps for the source data (standard simulation frame rate)
    double velocity = distInMeters * 60.0; 
    
    return velocity;
  }

  /// Maps Power (0-100) to actual Impulse Force for Forge2D using Calibrated Mapping
  static double mapPowerToImpulse(double powerPercentage) {
    // Determine Discrete Level (1-5)
    int level = (powerPercentage / 20).ceil().clamp(1, 5);
    
    // Get base velocity from map
    double velocity = BilliardConstants.powerVelocityMap[level] ?? 5.0;
    
    // Fine-tune within the level range
    double subLevel = (powerPercentage % 20) / 20.0;
    double nextVelocity = BilliardConstants.powerVelocityMap[level + 1] ?? velocity;
    
    return velocity + (nextVelocity - velocity) * subLevel;
  }
}
