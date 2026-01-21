import 'package:flutter/material.dart';
import '../../core/physics/constants.dart';

class BilliardTablePainter extends CustomPainter {
  final bool showGrid;

  BilliardTablePainter({this.showGrid = false});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint();
    final tableRect = Rect.fromLTWH(0, 0, size.width, size.height);

    // 1. Outer Frame (Metallic Silver)
    final framePaint = Paint()
      ..color = const Color(0xFFB0BEC5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    // 2. Rail Area (Deep Blue)
    final railPaint = Paint()..color = const Color(0xFF357ABD);
    canvas.drawRect(tableRect, railPaint);
    canvas.drawRect(tableRect, framePaint);

    // 3. Table Bed (Tournament Sky Blue)
    // The Play Area MUST be exactly 2:1. The rails sit outside/on the edge of this play area.
    // In our simplified model, we use internal rails.
    final double railWidth = size.width * 0.035; // Standard rail width ratio
    final bedRect = Rect.fromLTRB(
      railWidth, railWidth, size.width - railWidth, size.height - railWidth
    );
    
    // Validate Geometry: After rail subtraction, the bed MUST maintain 2:1
    // We adjust the bed to be the largest 2:1 rect inside the padded area
    double bedW = bedRect.width;
    double bedH = bedRect.height;
    if (bedW > bedH * 2) {
      bedW = bedH * 2;
    } else {
      bedH = bedW / 2;
    }
    final finalBedRect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: bedW,
      height: bedH,
    );

    paint.color = const Color(0xFF4A90E2); // Sky Blue
    canvas.drawRect(finalBedRect, paint);

    // 4. Inner Shadow (Cushion Depth)
    final shadowPaint = Paint()
      ..color = Colors.black.withOpacity(0.25)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);
    canvas.drawRect(finalBedRect.deflate(1), shadowPaint);

    // 5. Perfect Square Grid (8x4 = 32 Squares)
    if (showGrid) {
      paint.color = Colors.white.withOpacity(0.12);
      paint.strokeWidth = 0.3;
      double step = finalBedRect.width / 8; // Same as finalBedRect.height / 4
      
      for (int i = 1; i < 8; i++) {
        double x = finalBedRect.left + i * step;
        canvas.drawLine(Offset(x, finalBedRect.top), Offset(x, finalBedRect.bottom), paint);
      }
      for (int i = 1; i < 4; i++) {
        double y = finalBedRect.top + i * step;
        canvas.drawLine(Offset(finalBedRect.left, y), Offset(finalBedRect.right, y), paint);
      }
    }

    // 6. Pearl Diamonds (Sights) - Aligned with Grid
    final pearlPaint = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white, Colors.grey.shade400],
      ).createShader(const Rect.fromLTWH(0, 0, 6, 6));
    
    double step = finalBedRect.width / 8;
    
    // Top & Bottom Rail Diamonds (7 points)
    for (int i = 1; i < 8; i++) {
      double x = finalBedRect.left + i * step;
      canvas.drawCircle(Offset(x, finalBedRect.top - railWidth / 2), 2.5, pearlPaint);
      canvas.drawCircle(Offset(x, finalBedRect.bottom + railWidth / 2), 2.5, pearlPaint);
    }
    // Left & Right Rail Diamonds (3 points)
    for (int i = 1; i < 4; i++) {
      double y = finalBedRect.top + i * step;
      canvas.drawCircle(Offset(finalBedRect.left - railWidth / 2, y), 2.5, pearlPaint);
      canvas.drawCircle(Offset(finalBedRect.right + railWidth / 2, y), 2.5, pearlPaint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
