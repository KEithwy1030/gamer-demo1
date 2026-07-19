class_name SegmentChest
extends StaticBody3D

signal opened

var is_open := false
var interaction_enabled := false
var visual: Sprite3D
var prompt: Label3D
var open_audio: AudioStreamPlayer3D


func _ready() -> void:
	add_to_group("segment_chest")
	collision_layer = 1
	collision_mask = 1

	var collider := CollisionShape3D.new()
	collider.name = "ChestCollision"
	var shape := BoxShape3D.new()
	shape.size = Vector3(1.45, 0.85, 0.9)
	collider.shape = shape
	collider.position.y = 0.42
	add_child(collider)

	visual = Sprite3D.new()
	visual.name = "ChestVisual"
	visual.texture = load("res://assets/items/runtime/chest_closed.png")
	visual.pixel_size = 0.00145
	visual.position = Vector3(0.0, 0.6, 0.0)
	visual.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	visual.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	visual.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(visual)

	prompt = Label3D.new()
	prompt.name = "InteractionPrompt"
	prompt.text = ""
	prompt.font_size = 30
	prompt.position = Vector3(0.0, 1.55, 0.0)
	prompt.modulate = Color(0.94, 0.78, 0.43, 1.0)
	prompt.outline_size = 7
	prompt.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(prompt)

	open_audio = AudioStreamPlayer3D.new()
	open_audio.name = "ChestOpenSound"
	open_audio.stream = load("res://assets/audio/runtime/chest_open.wav")
	open_audio.bus = &"SFX"
	open_audio.max_distance = 18.0
	add_child(open_audio)


func set_player_near(is_near: bool) -> void:
	if is_open:
		prompt.text = ""
	elif is_near and interaction_enabled:
		prompt.text = "[E] 搜刮"
	elif is_near:
		prompt.text = "危险未清除"
	else:
		prompt.text = ""


func open_chest() -> bool:
	if is_open or not interaction_enabled:
		return false
	is_open = true
	prompt.text = ""
	visual.texture = load("res://assets/items/runtime/chest_open.png")
	if not open_audio.playing:
		open_audio.play()
	opened.emit()
	return true
