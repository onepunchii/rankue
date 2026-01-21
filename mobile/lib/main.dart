import 'package:flutter/material.dart';
import 'features/simulation/simulation_page.dart';

void main() {
  runApp(const HiQBilliardApp());
}

class HiQBilliardApp extends StatelessWidget {
  const HiQBilliardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'HiQ Billiard Simulation',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        primarySwatch: Colors.green,
        useMaterial3: true,
      ),
      home: const SimulationPage(),
    );
  }
}
