class BilliardConstants {
  // Table Dimensions logic (2:1 Ratio)
  static const double tableWidth = 2.844; 
  static const double tableHeight = 1.422; 
  
  // Ball Specs from PRD: 2.16% of Height
  static const double ballRadius = 0.0307; 
  
  // Linear Damping: Adjusted for 5.5 laps
  static const double linearDamping = 0.15; 
  
  // Friction and Restitution
  static const double wallRestitution = 0.75;
  static const double ballRestitution = 0.95;
  static const double cushionFriction = 0.2;
  
  // Spin Normalization from DB analysis
  static const double dataMaxSpin = 12.0;

  // Calibrated Power Mapping (avg px/s from DB scaled to m/s)
  // Scaling: 500px = 2.844m -> 1px = 0.005688m
  static const Map<int, double> powerVelocityMap = {
    1: 4.5,
    2: 6.8,    
    3: 8.5,    
    4: 9.5,    
    5: 12.0,   
  };
}
