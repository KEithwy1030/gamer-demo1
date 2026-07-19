class_name SegmentMonster
extends CharacterBody3D

signal health_changed(current: int, maximum: int)
signal died
signal attack_telegraphed

enum State { IDLE, CHASE, WINDUP, RECOVER, DEAD }

const MOVE_SPEED := 2.35
const AGGRO_RANGE := 6.5
const ATTACK_RANGE := 1.25
const WINDUP_TIME := 0.58
const RECOVER_TIME := 0.75

var max_health := 45
var health := 45
var is_dead := false
var target: SegmentPlayer
var state := State.IDLE
var facing := Vector3(0.0, 0.0, 1.0)
var _state_time := 0.0
var _animation_time := 0.0
var _knockback_velocity := Vector3.ZERO

var visual: Sprite3D
var nameplate: Label3D
var hit_audio: AudioStreamPlayer3D


func _ready() -> void:
	add_to_group("segment_monster")
	collision_layer = 1
	collision_mask = 1

	var collider := CollisionShape3D.new()
	collider.name = "BodyCollision"
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.43
	capsule.height = 1.1
	collider.shape = capsule
	collider.position.y = 0.55
	add_child(collider)

	visual = Sprite3D.new()
	visual.name = "MonsterVisual"
	visual.texture = load("res://assets/characters/runtime/monster_normal_4x4.png")
	visual.hframes = 4
	visual.vframes = 4
	visual.frame = 0
	visual.pixel_size = 0.0048
	visual.position = Vector3(0.0, 0.72, 0.0)
	visual.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	visual.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	visual.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(visual)

	nameplate = Label3D.new()
	nameplate.name = "MonsterHealth"
	nameplate.text = "食尸犬 45"
	nameplate.font_size = 28
	nameplate.position = Vector3(0.0, 1.62, 0.0)
	nameplate.modulate = Color(0.82, 0.85, 0.9, 0.9)
	nameplate.outline_size = 5
	nameplate.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(nameplate)

	hit_audio = AudioStreamPlayer3D.new()
	hit_audio.name = "FleshHit"
	hit_audio.stream = load("res://assets/audio/runtime/hit_flesh.wav")
	hit_audio.bus = &"SFX"
	hit_audio.max_distance = 16.0
	add_child(hit_audio)


func _physics_process(delta: float) -> void:
	if is_dead:
		return
	_state_time += delta
	_animation_time += delta

	if _knockback_velocity.length_squared() > 0.01:
		velocity = _knockback_velocity
		_knockback_velocity = _knockback_velocity.move_toward(Vector3.ZERO, delta * 13.0)
		move_and_slide()
		_update_visual_frame()
		return

	if not is_instance_valid(target) or target.is_dead:
		state = State.IDLE
		velocity = Vector3.ZERO
		_update_visual_frame()
		return

	var offset := target.global_position - global_position
	offset.y = 0.0
	var distance := offset.length()
	if distance > 0.01:
		facing = offset.normalized()

	match state:
		State.IDLE:
			velocity = Vector3.ZERO
			if distance <= AGGRO_RANGE:
				_set_state(State.CHASE)
		State.CHASE:
			if distance <= ATTACK_RANGE:
				velocity = Vector3.ZERO
				_set_state(State.WINDUP)
			elif distance > AGGRO_RANGE * 1.8:
				_set_state(State.IDLE)
			else:
				velocity = facing * MOVE_SPEED
				move_and_slide()
		State.WINDUP:
			velocity = Vector3.ZERO
			if _state_time >= WINDUP_TIME:
				if distance <= ATTACK_RANGE + 0.35:
					target.take_damage(8)
				_set_state(State.RECOVER)
		State.RECOVER:
			velocity = Vector3.ZERO
			if _state_time >= RECOVER_TIME:
				_set_state(State.CHASE)

	_update_visual_frame()


func take_damage(amount: int, impact_direction := Vector3.ZERO) -> void:
	if is_dead:
		return
	health = maxi(0, health - amount)
	nameplate.text = "食尸犬 %d" % health
	health_changed.emit(health, max_health)
	visual.modulate = Color(1.35, 1.35, 1.35, 1.0)
	get_tree().create_timer(0.1).timeout.connect(_clear_hit_flash)
	if not hit_audio.playing:
		hit_audio.play()
	if impact_direction.length_squared() > 0.01:
		_knockback_velocity = impact_direction.normalized() * 1.8
	if health == 0:
		is_dead = true
		state = State.DEAD
		velocity = Vector3.ZERO
		nameplate.visible = false
		visual.frame = _facing_row() * 4 + 3
		visual.modulate = Color(0.42, 0.44, 0.48, 0.82)
		died.emit()


func _set_state(next_state: State) -> void:
	var previous_state := state
	state = next_state
	_state_time = 0.0
	if previous_state == State.WINDUP and state != State.WINDUP and is_instance_valid(visual):
		visual.modulate = Color.WHITE
	if state == State.WINDUP:
		attack_telegraphed.emit()


func _clear_hit_flash() -> void:
	if not is_instance_valid(visual) or is_dead:
		return
	visual.modulate = Color.WHITE


func _update_visual_frame() -> void:
	var column := 0
	if state == State.WINDUP:
		column = 3
	elif state == State.CHASE:
		column = int(_animation_time * 6.0) % 3
	else:
		column = int(_animation_time * 1.8) % 3
	visual.frame = _facing_row() * 4 + column
	visual.modulate = Color(1.15, 0.72, 0.62, 1.0) if state == State.WINDUP else visual.modulate


func _facing_row() -> int:
	if absf(facing.x) > absf(facing.z):
		return 2 if facing.x > 0.0 else 1
	return 0 if facing.z > 0.0 else 3
