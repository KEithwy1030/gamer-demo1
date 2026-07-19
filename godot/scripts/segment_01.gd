class_name Segment01Controller
extends Node3D

enum Phase { ENTER_RUINS, DEFEAT_GUARD, OPEN_CHEST, CHOOSE_LOOT, NEXT_ROUTE }

const CAMERA_OFFSET := Vector3(7.0, 14.0, 7.0)
const CHEST_INTERACT_RANGE := 2.25

var phase := Phase.ENTER_RUINS
var segment_complete := false
var loot_choice := "none"
var carried_item := "空"
var carried_value := 0

var player: SegmentPlayer
var monster: SegmentMonster
var chest: SegmentChest
var camera: Camera3D
var next_route_marker: Node3D
var hp_label: Label
var carry_label: Label
var objective_label: Label
var loot_panel: Control
var loot_audio: AudioStreamPlayer


func _ready() -> void:
	_build_environment()
	_build_ruin_route()
	_spawn_actors()
	_build_hud()
	_set_objective("穿过断墙，清除宝箱旁的食尸犬")
	monster.died.connect(_on_monster_died)
	chest.opened.connect(_on_chest_opened)
	player.health_changed.connect(_on_player_health_changed)


func _process(_delta: float) -> void:
	if is_instance_valid(camera) and is_instance_valid(player):
		camera.global_position = player.global_position + CAMERA_OFFSET
		camera.look_at(player.global_position + Vector3(0.0, 0.45, -0.8), Vector3.UP)
	if is_instance_valid(chest) and is_instance_valid(player):
		var distance := _flat_distance(player.global_position, chest.global_position)
		chest.set_player_near(distance <= CHEST_INTERACT_RANGE)
		if phase == Phase.ENTER_RUINS and player.global_position.z < 4.4:
			phase = Phase.DEFEAT_GUARD


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_E:
				try_open_chest()
			KEY_1:
				choose_loot("equip")
			KEY_2:
				choose_loot("carry")
			KEY_3:
				choose_loot("discard")


func try_open_chest() -> bool:
	if not is_instance_valid(player) or not is_instance_valid(chest):
		return false
	if _flat_distance(player.global_position, chest.global_position) > CHEST_INTERACT_RANGE:
		return false
	return chest.open_chest()


func choose_loot(choice: String) -> bool:
	if phase != Phase.CHOOSE_LOOT or choice not in ["equip", "carry", "discard"]:
		return false
	loot_choice = choice
	match choice:
		"equip":
			carried_item = "古银圣像 · 护符"
			carried_value = 90
			player.attack_damage += 5
		"carry":
			carried_item = "古银圣像"
			carried_value = 180
		"discard":
			carried_item = "空"
			carried_value = 0
	carry_label.text = "携带  %s  ·  %d" % [carried_item, carried_value]
	loot_panel.visible = false
	next_route_marker.visible = true
	phase = Phase.NEXT_ROUTE
	segment_complete = true
	_set_objective("沿冷蓝信标继续向撤离路线推进")
	if not loot_audio.playing:
		loot_audio.play()
	return true


func _on_monster_died() -> void:
	chest.interaction_enabled = true
	phase = Phase.OPEN_CHEST
	_set_objective("靠近铁箱，按 E 搜刮")


func _on_chest_opened() -> void:
	phase = Phase.CHOOSE_LOOT
	loot_panel.visible = true
	_set_objective("决定古银圣像的去向")


func _on_player_health_changed(current: int, maximum: int) -> void:
	hp_label.text = "生命  %d / %d" % [current, maximum]


func _set_objective(text: String) -> void:
	objective_label.text = text


func _build_environment() -> void:
	var world_environment := WorldEnvironment.new()
	world_environment.name = "MoonlitEnvironment"
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.018, 0.025, 0.045)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.34, 0.42, 0.58)
	environment.ambient_light_energy = 0.72
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.fog_enabled = true
	environment.fog_light_color = Color(0.17, 0.22, 0.29)
	environment.fog_density = 0.012
	world_environment.environment = environment
	add_child(world_environment)

	var moon := DirectionalLight3D.new()
	moon.name = "TopLeftMoon"
	moon.light_color = Color(0.64, 0.75, 1.0)
	moon.light_energy = 1.35
	moon.shadow_enabled = true
	moon.rotation_degrees = Vector3(-55.0, -35.0, 0.0)
	add_child(moon)

	camera = Camera3D.new()
	camera.name = "ObliqueCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 11.5
	camera.near = 0.1
	camera.far = 80.0
	camera.current = true
	add_child(camera)


func _build_ruin_route() -> void:
	var ground := StaticBody3D.new()
	ground.name = "Ground3D"
	ground.collision_layer = 1
	ground.collision_mask = 1
	add_child(ground)

	var ground_mesh := MeshInstance3D.new()
	ground_mesh.name = "MoonlitGroundAsset"
	var plane := PlaneMesh.new()
	plane.size = Vector2(20.0, 25.0)
	var ground_material := StandardMaterial3D.new()
	ground_material.albedo_texture = load("res://assets/environment/runtime/moonlit_ground.png")
	ground_material.albedo_color = Color(0.4, 0.46, 0.55)
	ground_material.roughness = 0.95
	ground_material.uv1_scale = Vector3(2.5, 2.5, 2.5)
	plane.material = ground_material
	ground_mesh.mesh = plane
	ground.add_child(ground_mesh)

	var ground_collision := CollisionShape3D.new()
	ground_collision.name = "GroundCollision"
	var ground_shape := BoxShape3D.new()
	ground_shape.size = Vector3(20.0, 0.2, 25.0)
	ground_collision.shape = ground_shape
	ground_collision.position.y = -0.11
	ground.add_child(ground_collision)

	_create_wall("WestBoundary", Vector3(-6.1, 1.15, 1.0), Vector3(1.0, 2.3, 15.0))
	_create_wall("EastBoundary", Vector3(6.1, 1.15, -1.0), Vector3(1.0, 2.3, 17.0))
	_create_wall("ArchWest", Vector3(-2.45, 1.45, 4.0), Vector3(2.7, 2.9, 1.0))
	_create_wall("ArchEast", Vector3(2.45, 1.45, 4.0), Vector3(2.7, 2.9, 1.0))
	_create_wall("ChestWall", Vector3(-3.8, 1.1, -3.7), Vector3(3.4, 2.2, 0.9))
	_create_wall("BrokenReturn", Vector3(3.8, 0.85, -5.6), Vector3(3.0, 1.7, 0.8))

	_create_structure_sprite("ArchAsset", 7, Vector3(0.0, 1.35, 4.12), 0.0105)
	_create_structure_sprite("WestPalisadeAsset", 6, Vector3(-4.8, 1.25, 0.5), 0.010)
	_create_structure_sprite("NorthRuinAsset", 8, Vector3(3.9, 1.2, -5.7), 0.010)
	_create_structure_sprite("CorpseRiverAsset", 5, Vector3(-4.0, 0.06, -7.6), 0.0085)

	var chest_light := OmniLight3D.new()
	chest_light.name = "ChestLantern"
	chest_light.position = Vector3(0.0, 2.0, -3.3)
	chest_light.light_color = Color(1.0, 0.54, 0.22)
	chest_light.light_energy = 2.2
	chest_light.omni_range = 5.5
	chest_light.shadow_enabled = true
	add_child(chest_light)

	next_route_marker = Node3D.new()
	next_route_marker.name = "NextRouteBeacon"
	next_route_marker.position = Vector3(0.0, 0.0, -9.2)
	next_route_marker.visible = false
	add_child(next_route_marker)
	var beacon_mesh := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.12
	cylinder.bottom_radius = 0.45
	cylinder.height = 0.06
	var beacon_material := StandardMaterial3D.new()
	beacon_material.albedo_color = Color(0.2, 0.63, 0.92, 0.9)
	beacon_material.emission_enabled = true
	beacon_material.emission = Color(0.1, 0.48, 0.9)
	beacon_material.emission_energy_multiplier = 3.0
	cylinder.material = beacon_material
	beacon_mesh.mesh = cylinder
	next_route_marker.add_child(beacon_mesh)
	var beacon_label := Label3D.new()
	beacon_label.text = "撤离方向"
	beacon_label.font_size = 34
	beacon_label.position.y = 0.65
	beacon_label.modulate = Color(0.54, 0.82, 1.0)
	beacon_label.outline_size = 7
	beacon_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	next_route_marker.add_child(beacon_label)


func _create_wall(node_name: String, wall_position: Vector3, size: Vector3) -> void:
	var wall := StaticBody3D.new()
	wall.name = node_name
	wall.position = wall_position
	wall.collision_layer = 1
	wall.collision_mask = 1
	add_child(wall)
	var mesh_instance := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.15, 0.17, 0.19)
	material.roughness = 0.94
	box.material = material
	mesh_instance.mesh = box
	mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	wall.add_child(mesh_instance)
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	wall.add_child(collision)


func _create_structure_sprite(node_name: String, atlas_frame: int, sprite_position: Vector3, pixel_size: float) -> void:
	var sprite := Sprite3D.new()
	sprite.name = node_name
	sprite.texture = load("res://assets/environment/runtime/ruin_structures_3x3.png")
	sprite.hframes = 3
	sprite.vframes = 3
	sprite.frame = atlas_frame
	sprite.pixel_size = pixel_size
	sprite.position = sprite_position
	sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(sprite)


func _spawn_actors() -> void:
	player = SegmentPlayer.new()
	player.name = "Player"
	player.position = Vector3(0.0, 0.0, 8.2)
	add_child(player)

	monster = SegmentMonster.new()
	monster.name = "GhoulGuard"
	monster.position = Vector3(0.7, 0.0, -0.2)
	monster.target = player
	add_child(monster)

	chest = SegmentChest.new()
	chest.name = "ContestedChest"
	chest.position = Vector3(0.0, 0.0, -3.5)
	add_child(chest)


func _build_hud() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "GameHUD"
	add_child(canvas)

	hp_label = _make_hud_label("生命  100 / 100", 28, Color(0.92, 0.91, 0.86))
	hp_label.position = Vector2(36.0, 28.0)
	canvas.add_child(hp_label)

	carry_label = _make_hud_label("携带  空  ·  0", 24, Color(0.84, 0.72, 0.48))
	carry_label.position = Vector2(36.0, 70.0)
	canvas.add_child(carry_label)

	objective_label = _make_hud_label("", 24, Color(0.72, 0.82, 0.94))
	objective_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	objective_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	objective_label.position = Vector2(-520.0, 28.0)
	objective_label.size = Vector2(480.0, 44.0)
	canvas.add_child(objective_label)

	loot_panel = PanelContainer.new()
	loot_panel.name = "LootChoice"
	loot_panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	loot_panel.position = Vector2(-350.0, -178.0)
	loot_panel.size = Vector2(700.0, 142.0)
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.025, 0.03, 0.045, 0.92)
	panel_style.border_color = Color(0.54, 0.42, 0.23, 0.95)
	panel_style.set_border_width_all(2)
	panel_style.corner_radius_top_left = 4
	panel_style.corner_radius_top_right = 4
	panel_style.corner_radius_bottom_left = 4
	panel_style.corner_radius_bottom_right = 4
	loot_panel.add_theme_stylebox_override("panel", panel_style)
	canvas.add_child(loot_panel)

	var choices := VBoxContainer.new()
	choices.add_theme_constant_override("separation", 10)
	loot_panel.add_child(choices)
	var loot_header := HBoxContainer.new()
	loot_header.alignment = BoxContainer.ALIGNMENT_CENTER
	loot_header.add_theme_constant_override("separation", 10)
	choices.add_child(loot_header)
	var relic_icon := TextureRect.new()
	relic_icon.name = "RelicIcon"
	relic_icon.texture = load("res://assets/items/runtime/relic_idol.png")
	relic_icon.custom_minimum_size = Vector2(44.0, 44.0)
	relic_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	relic_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	loot_header.add_child(relic_icon)
	var title := _make_hud_label("古银圣像", 27, Color(0.96, 0.79, 0.42))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loot_header.add_child(title)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 16)
	choices.add_child(row)
	row.add_child(_make_choice_button("1  装备护符  ·  攻击 +5", "equip"))
	row.add_child(_make_choice_button("2  带走珍品  ·  价值 180", "carry"))
	row.add_child(_make_choice_button("3  放弃  ·  保持空位", "discard"))
	loot_panel.visible = false

	loot_audio = AudioStreamPlayer.new()
	loot_audio.name = "LootConfirm"
	loot_audio.stream = load("res://assets/audio/runtime/loot_confirm.wav")
	loot_audio.bus = &"UI"
	canvas.add_child(loot_audio)


func _make_hud_label(text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.86))
	label.add_theme_constant_override("shadow_offset_x", 2)
	label.add_theme_constant_override("shadow_offset_y", 2)
	return label


func _make_choice_button(text: String, choice: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(205.0, 54.0)
	button.add_theme_font_size_override("font_size", 18)
	button.tooltip_text = text
	button.pressed.connect(func() -> void: choose_loot(choice))
	return button


func _flat_distance(a: Vector3, b: Vector3) -> float:
	return Vector2(a.x - b.x, a.z - b.z).length()
