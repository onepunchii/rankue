import 'package:flutter/material.dart';
import 'dart:math';
import '../../core/physics/constants.dart';

/// Widget to visualize ball thickness (overlapping balls)
class ThicknessVisualizer extends StatelessWidget {
  final double thickness; // 0.0 (no overlap) to 1.0 (full hit)
  final bool isLeftHit;

  const ThicknessVisualizer({
    super.key, 
    required this.thickness, 
    this.isLeftHit = true
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Text("THICKNESS", style: TextStyle(color: Colors.white38, fontSize: 8, fontWeight: FontWeight.bold, letterSpacing: 1)),
        const SizedBox(height: 8),
        SizedBox(
          width: 80,
          height: 60,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Object Ball (Yellow/Red)
              Positioned(
                left: 20,
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    gradient: const RadialGradient(colors: [Color(0xFFFFD600), Color(0xFFFFAB00)]),
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(blurRadius: 10, color: Colors.yellow.withOpacity(0.2))],
                  ),
                ),
              ),
              // Cue Ball (White) - Overlapping
              Positioned(
                left: 20 + (isLeftHit ? - (40 * (1 - thickness)) : (40 * (1 - thickness))),
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(begin: Alignment.topLeft, colors: [Colors.white, Color(0xFFE0E0E0)]),
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(blurRadius: 15, color: Colors.black.withOpacity(0.4))],
                    border: Border.all(color: Colors.white, width: 0.5),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Widget to visualize spin/tip position (red dot on cue ball)
class SpinVisualizer extends StatelessWidget {
  final Point<double> spin; // Raw values from DB (e.g., 6.0, 3.0)

  const SpinVisualizer({super.key, required this.spin});

  @override
  Widget build(BuildContext context) {
    double ratioX = spin.x / BilliardConstants.dataMaxSpin;
    double ratioY = -spin.y / BilliardConstants.dataMaxSpin;

    double dist = sqrt(ratioX * ratioX + ratioY * ratioY);
    if (dist > 1.0) {
      ratioX /= dist;
      ratioY /= dist;
    }

    const double uiRadius = 24.0;
    double offsetX = ratioX * uiRadius;
    double offsetY = ratioY * uiRadius;

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Text("SPIN", style: TextStyle(color: Colors.white38, fontSize: 8, fontWeight: FontWeight.bold, letterSpacing: 1)),
        const SizedBox(height: 8),
        Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const RadialGradient(colors: [Colors.white, Color(0xFFB0BEC5)]),
            boxShadow: [BoxShadow(blurRadius: 15, color: Colors.black.withOpacity(0.3))],
            border: Border.all(color: Colors.white, width: 1),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Crosshairs
              Container(width: 40, height: 0.5, color: Colors.black12),
              Container(width: 0.5, height: 40, color: Colors.black12),
              // Spin Point (Glowing Red Dot)
              Transform.translate(
                offset: Offset(offsetX, offsetY),
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(blurRadius: 8, color: Colors.red.withOpacity(0.8), spreadRadius: 1)],
                    border: Border.all(color: Colors.white30, width: 1),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Power Gauge (Vertical Steps Bar)
class PowerGauge extends StatelessWidget {
  final double power; // 0 to 100

  const PowerGauge({super.key, required this.power});

  @override
  Widget build(BuildContext context) {
    int segments = (power / 20).round().clamp(1, 5);
    return Column(
      children: [
        const Text("POWER", style: TextStyle(color: Colors.white38, fontSize: 8, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(5, (index) {
              int reversedIndex = 4 - index;
              bool isActive = reversedIndex < segments;
              return Container(
                width: 30,
                height: 12,
                decoration: BoxDecoration(
                  color: isActive ? const Color(0xFF4A90E2) : Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(4),
                  boxShadow: isActive ? [BoxShadow(blurRadius: 8, color: const Color(0xFF4A90E2).withOpacity(0.4))] : null,
                ),
              );
            }),
          ),
        ),
      ],
    );
  }
}
