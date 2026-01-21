import 'package:flame/extensions.dart';
import 'package:flame_forge2d/flame_forge2d.dart';
import 'constants.dart';

class BilliardGame extends Forge2DGame {
  BilliardGame() : super(gravity: Vector2.zero(), zoom: 100);

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    _createBoundaries();
  }

  void _createBoundaries() {
    add(Wall(Vector2(0, 0), Vector2(BilliardConstants.tableWidth, 0)));
    add(Wall(Vector2(0, BilliardConstants.tableHeight), Vector2(BilliardConstants.tableWidth, BilliardConstants.tableHeight)));
    add(Wall(Vector2(0, 0), Vector2(0, BilliardConstants.tableHeight)));
    add(Wall(Vector2(BilliardConstants.tableWidth, 0), Vector2(BilliardConstants.tableWidth, BilliardConstants.tableHeight)));
  }

  void resetTable(Map<String, Point<double>> balls) {
    // 1. Remove existing balls (Simple way for now)
    world.bodies.forEach((body) {
      if (body.userData is Ball) {
        // In real app, remove properly via Flame
      }
    });

    // 2. Spawn new balls
    balls.forEach((id, pos) {
      add(Ball(
        id, 
        Vector2(pos.x * BilliardConstants.tableWidth / 500, pos.y * BilliardConstants.tableHeight / 250),
        id == 'white' ? Colors.white : (id == 'yellow' ? Colors.yellow : Colors.red)
      ));
    });
  }

  void executeShot(ShotData shot) {
    // Find white ball component
    final whiteBall = children.whereType<Ball>().firstWhere((b) => b.id == 'white');
    
    // Logic: In a real simulation, we'd need a target direction.
    // For now, let's use the first segment of the expert path as direction.
    if (shot.paths['white']!.length > 1) {
      final p1 = shot.paths['white']![0];
      final p2 = shot.paths['white']![1];
      final direction = Vector2(p2.x - p1.x, p2.y - p1.y).normalized();
      
      final velocity = direction * PhysicsCalibrator.mapPowerToImpulse(shot.solution.power);
      final spin = Vector2(shot.solution.spin.x, shot.solution.spin.y);
      
      whiteBall.applyImpulse(velocity, spin);
    }
  }
}

class Ball extends BodyComponent with ContactCallbacks {
  final String id;
  final Vector2 initialPosition;
  final Color color;

  Ball(this.id, this.initialPosition, this.color);

  @override
  Body createBody() {
    final shape = CircleShape()..radius = BilliardConstants.ballRadius;
    final fixtureDef = FixtureDef(shape)
      ..restitution = BilliardConstants.ballRestitution
      ..friction = 0.1
      ..density = 1.0;

    final bodyDef = BodyDef()
      ..type = BodyType.dynamic
      ..position = initialPosition
      ..linearDamping = BilliardConstants.linearDamping
      ..angularDamping = 0.5;

    return world.createBody(bodyDef)..createFixture(fixtureDef);
  }

  @override
  void render(Canvas canvas) {
    final paint = Paint()..color = color;
    canvas.drawCircle(Offset.zero, BilliardConstants.ballRadius, paint);
    
    // Draw a small dot to see rotation
    paint.color = Colors.black45;
    canvas.drawCircle(Offset(BilliardConstants.ballRadius * 0.5, 0), 2, paint);
  }

  void applyImpulse(Vector2 velocity, Vector2 spin) {
    body.applyLinearImpulse(velocity);
    // Angular impulse (Spin)
    // x component traditionally used for side spin in 2D top-down
    body.applyAngularImpulse(spin.x * 0.1); 
  }

  @override
  void beginContact(Object other, Contact contact) {
    if (other is Wall) {
      // Apply Spin Impulse logic on cushion collision
      _applySpinReflex(contact);
    }
    super.beginContact(other, contact);
  }

  void _applySpinReflex(Contact contact) {
    // Get collision normal
    final worldManifold = WorldManifold();
    contact.getWorldManifold(worldManifold);
    final normal = worldManifold.normal;
    
    // Tangential direction
    final tangent = Vector2(-normal.y, normal.x);
    
    // Strength of spin effect
    double spinEffect = body.angularVelocity * 0.05;
    
    // Apply tangential impulse to change reflection angle
    body.applyLinearImpulse(tangent * spinEffect);
  }
}

class Wall extends BodyComponent {
  final Vector2 start;
  final Vector2 end;

  Wall(this.start, this.end);

  @override
  Body createBody() {
    final shape = EdgeShape()..set(start, end);
    final fixtureDef = FixtureDef(shape)
      ..restitution = BilliardConstants.wallRestitution
      ..friction = BilliardConstants.cushionFriction;

    final bodyDef = BodyDef()..type = BodyType.static;
    return world.createBody(bodyDef)..createFixture(fixtureDef);
  }
}
