class_name SegmentPlayer
extends CharacterBody3D

signal health_changed(current: int, maximum: int)
signal attack_resolved(hit_count: int)
signal died

const MOVE_SPEED := 4.2
const ATTACK_RANGE := 2.25
const ATTACK_COOLDOWN := 0.72
const ATTACK_WINDUP := 0.13
const ATTACK_DURATION := 0.42

var max_health := 100
var health := 100
var attack_damage := 15
var facing := Vector3(0.0, 0.0, -1.0)
var is_dead := false
var _attack_elapsed := ATTACK_DURATION
var _attack_cooldown_left := 0.0
var _pending_hit := false
var _animation_time := 0.0
var _test_move_active := false
var _test_move_input := Vector2.ZERO

var visual: Sprite3D
var attack_audio: AudioStreamPlayer3D


func _ready() -> void:
	add_to_group("segment_player")
	collision_layer = 1
	collision_mask = 1

	var collider := CollisionShape3D.new()
	collider.name = "BodyCollision"
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.36
	capsule.height = 1.35
	collider.shape = capsule
	collider.position.y = 0.68
	add_child(collider)

	visual = Sprite3D.new()
	visual.name = "StableFootVisual"
	visual.texture = load("res://assets/characters/runtime/player_sword_8x4.png")
	visual.hframes = 8
	visual.vframes = 4
	visual.frame = 24
	visual.pixel_size = 0.0062
	visual.position = Vector3(0.0, 0.72, 0.0)
	visual.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	visual.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	visual.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(visual)

	attack_audio = AudioStreamPlayer3D.new()
	attack_audio.name = "AttackWhoosh"
	attack_audio.stream = load("res://assets/audio/runtime/attack_whoosh.wav")
	attack_audio.bus = &"SFX"
	attack_audio.max_distance = 16.0
	add_child(attack_audio)


func _physics_process(delta: float) -> void:
	_attack_cooldown_left = maxf(0.0, _attack_cooldown_left - delta)
	_animation_time += delta

	if is_dead:
		velocity = Vector3.ZERO
		return

	if _attack_elapsed < ATTACK_DURATION:
		_attack_elapsed += delta
		velocity = Vector3.ZERO
		if _pending_hit and _attack_elapsed >= ATTACK_WINDUP:
			_pending_hit = false
			_resolve_attack()
	else:
		var input_2d := _read_move_input()
		var direction := Vector3(input_2d.x, 0.0, input_2d.y)
		if direction.length_squared() > 0.01:
			direction = direction.normalized()
			facing = direction
			velocity = direction * MOVE_SPEED
		else:
			velocity = Vector3.ZERO
		move_and_slide()

	_update_visual_frame()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_SPACE:
		request_attack()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		request_attack()


func _read_move_input() -> Vector2:
	if _test_move_active:
		return _test_move_input.limit_length(1.0)
	var horizontal := float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A))
	var vertical := float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))
	return Vector2(horizontal, vertical).limit_length(1.0)


func set_test_move_input(value: Vector2) -> void:
	_test_move_active = true
	_test_move_input = value


func clear_test_move_input() -> void:
	_test_move_active = false
	_test_move_input = Vector2.ZERO


func request_attack() -> bool:
	if is_dead or _attack_cooldown_left > 0.0 or _attack_elapsed < ATTACK_DURATION:
		return false
	_attack_elapsed = 0.0
	_attack_cooldown_left = ATTACK_COOLDOWN
	_pending_hit = true
	if not attack_audio.playing:
		attack_audio.play()
	return true


func _resolve_attack() -> void:
	var hit_count := 0
	for node in get_tree().get_nodes_in_group("segment_monster"):
		if not is_instance_valid(node) or node.is_dead:
			continue
		var offset: Vector3 = node.global_position - global_position
		offset.y = 0.0
		if offset.length() <= ATTACK_RANGE and facing.dot(offset.normalized()) >= 0.12:
			node.take_damage(attack_damage, facing)
			hit_count += 1
	attack_resolved.emit(hit_count)


func take_damage(amount: int) -> void:
	if is_dead:
		return
	health = maxi(0, health - amount)
	health_changed.emit(health, max_health)
	visual.modulate = Color(1.0, 0.42, 0.42, 1.0)
	get_tree().create_timer(0.11).timeout.connect(_clear_hurt_tint)
	if health == 0:
		is_dead = true
		died.emit()


func _clear_hurt_tint() -> void:
	if is_instance_valid(visual):
		visual.modulate = Color.WHITE


func _update_visual_frame() -> void:
	var row := _facing_row()
	var column := 0
	if _attack_elapsed < ATTACK_DURATION:
		column = 3 + mini(4, int((_attack_elapsed / ATTACK_DURATION) * 5.0))
	elif velocity.length_squared() > 0.01:
		column = int(_animation_time * 7.0) % 3
	else:
		column = int(_animation_time * 2.2) % 3
	visual.frame = row * 8 + column


func _facing_row() -> int:
	if absf(facing.x) > absf(facing.z):
		return 1 if facing.x > 0.0 else 2
	return 0 if facing.z > 0.0 else 3
