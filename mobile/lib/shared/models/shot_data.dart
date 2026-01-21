import 'dart:math';

class BallFrame {
  final double t;
  final double x;
  final double y;
  BallFrame({required this.t, required this.x, required this.y});
}

class ShotData {
  final String title;
  final Map<String, Point<double>> balls; // Initial positions
  final Map<String, List<BallFrame>> paths; // Full trajectories with time
  final Solution solution;
  final String tip;
  final String url;

  ShotData({
    required this.title,
    required this.balls,
    required this.paths,
    required this.solution,
    required this.tip,
    required this.url,
  });

  factory ShotData.fromJson(Map<String, dynamic> json) {
    var ballsRaw = json['balls'] as Map<String, dynamic>;
    Map<String, Point<double>> balls = {};
    Map<String, List<Point<double>>> paths = {};

    ballsRaw.forEach((color, value) {
      if (value is List && value.isNotEmpty) {
        // First point is initial pos
        balls[color] = Point(
          (value[0]['x'] ?? 0.0).toDouble(),
          (value[0]['y'] ?? 0.0).toDouble(),
        );
        // Store full path with time
        paths[color] = value.map<BallFrame>((p) => BallFrame(
          t: (p['t'] ?? 0.0).toDouble(),
          x: (p['x'] ?? 0.0).toDouble(),
          y: (p['y'] ?? 0.0).toDouble(),
        )).toList();
      }
    });

    return ShotData(
      title: json['title'] ?? 'Unknown Shot',
      balls: balls,
      paths: paths,
      solution: Solution.fromJson(json['solution'] ?? {}),
      tip: json['solution']['description_tip'] ?? '',
      url: json['url'] ?? '',
    );
  }
}

class Solution {
  final double thickness;
  final Point<double> spin;
  final double power;

  Solution({
    required this.thickness,
    required this.spin,
    required this.power,
  });

  factory Solution.fromJson(Map<String, dynamic> json) {
    return Solution(
      thickness: (json['thickness'] ?? 0.5).toDouble(),
      spin: Point(
        (json['spin']['x'] ?? 0.0).toDouble(),
        (json['spin']['y'] ?? 0.0).toDouble(),
      ),
      power: (json['power'] ?? 60.0).toDouble(),
    );
  }
}
