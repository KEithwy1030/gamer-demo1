extends SceneTree

var failures: Array[String] = []
var checks := 0


func _initialize() -> void:
	call_deferred("_run")


func _check(condition: bool, message: String) -> void:
	checks += 1
	if condition:
		print("PASS: ", message)
	else:
		failures.append(message)
		push_error("FAIL: " + message)


func _run() -> void:
	var scene: PackedScene = load("res://scenes/segment_01.tscn")
	_check(scene != null, "真实 Segment 01 主场景可加载")
	if scene == null:
		_finish()
		return

	var segment: Segment01Controller = scene.instantiate()
	root.add_child(segment)
	await process_frame
	await physics_frame

	_check(segment.camera != null, "场景存在 Camera3D")
	_check(segment.camera.projection == Camera3D.PROJECTION_ORTHOGONAL, "相机使用正交投影")
	var camera_forward := -segment.camera.global_transform.basis.z
	var pitch_degrees := rad_to_deg(asin(absf(camera_forward.y)))
	_check(pitch_degrees >= 50.0 and pitch_degrees <= 60.0, "相机俯角位于 50-60 度")

	var static_bodies := _find_nodes_of_type(segment, "StaticBody3D")
	var collision_shapes := _find_nodes_of_type(segment, "CollisionShape3D")
	_check(static_bodies.size() >= 7, "地面、墙体、结构与宝箱使用真实 StaticBody3D")
	_check(collision_shapes.size() >= 10, "场景、玩家、怪物与宝箱存在真实 CollisionShape3D")
	_check(segment.player is CharacterBody3D, "玩家是 CharacterBody3D")
	_check(segment.monster is CharacterBody3D, "怪物是 CharacterBody3D")

	var start_position := segment.player.global_position
	segment.monster.process_mode = Node.PROCESS_MODE_DISABLED
	segment.player.set_test_move_input(Vector2(1.0, 0.0))
	for _index in range(12):
		await physics_frame
	segment.player.clear_test_move_input()
	_check(segment.player.global_position.x > start_position.x + 0.25, "玩家通过真实 physics tick 在 XZ 平面移动")
	_check(is_equal_approx(segment.player.global_position.y, start_position.y), "移动不引入 Y 轴漂浮")
	var stable_foot_anchor := segment.player.visual.position
	var direction_cases := [
		{"input": Vector2(1.0, 0.0), "row": 1, "name": "右"},
		{"input": Vector2(-1.0, 0.0), "row": 2, "name": "左"},
		{"input": Vector2(0.0, 1.0), "row": 0, "name": "前"},
		{"input": Vector2(0.0, -1.0), "row": 3, "name": "后"},
	]
	for direction_case in direction_cases:
		segment.player.set_test_move_input(direction_case["input"])
		for _index in range(2):
			await physics_frame
		var current_row := floori(float(segment.player.visual.frame) / 8.0)
		_check(current_row == direction_case["row"], "玩家%s方向使用独立可读动画行" % direction_case["name"])
	segment.player.clear_test_move_input()
	_check(segment.player.visual.position.is_equal_approx(stable_foot_anchor), "四方向切帧不改变脚底锚点")

	segment.monster.process_mode = Node.PROCESS_MODE_INHERIT
	segment.player.global_position = segment.monster.global_position + Vector3(0.0, 0.0, 1.0)
	for _index in range(3):
		await physics_frame
	_check(segment.monster.state == SegmentMonster.State.WINDUP, "怪物接敌后进入有时长的攻击前摇")
	_check(segment.monster.visual.frame % 4 == 3, "怪物前摇使用动作帧而非地面调试圈")

	segment.player.global_position = Vector3(0.0, 0.0, 0.9)
	segment.monster.process_mode = Node.PROCESS_MODE_DISABLED
	segment.player.facing = Vector3(0.0, 0.0, -1.0)
	segment.monster.global_position = Vector3(0.0, 0.0, -0.55)
	var health_before := segment.monster.health
	_check(segment.player.request_attack(), "基础攻击请求可启动")
	for _index in range(12):
		await physics_frame
	_check(segment.monster.health < health_before, "基础攻击通过真实玩家脚本造成伤害")

	while not segment.monster.is_dead:
		segment.monster.take_damage(segment.player.attack_damage, Vector3(0.0, 0.0, -1.0))
	_check(segment.monster.is_dead and segment.monster.health == 0, "怪物可受击并进入死亡状态")
	_check(segment.chest.interaction_enabled, "怪物死亡后宝箱交互被解锁")

	segment.player.global_position = segment.chest.global_position + Vector3(0.0, 0.0, 1.2)
	_check(segment.try_open_chest(), "玩家靠近后可打开真实宝箱")
	_check(segment.chest.is_open, "宝箱开闭状态发生变化")
	_check(segment.phase == Segment01Controller.Phase.CHOOSE_LOOT, "开箱后进入三选一状态")
	_check(segment.choose_loot("carry"), "可选择带走古银圣像")
	_check(segment.carried_item == "古银圣像" and segment.carried_value == 180, "loot choice 改变携带状态与价值")
	_check(segment.segment_complete, "作出战利品选择后 Segment End 状态可达")
	_check(segment.next_route_marker.visible, "End 状态显示下一路线世界标记")
	var choice_expectations := {
		"equip": {"item": "古银圣像 · 护符", "value": 90},
		"discard": {"item": "空", "value": 0},
	}
	for choice in choice_expectations:
		var branch_scene: PackedScene = load("res://scenes/segment_01.tscn")
		var branch: Segment01Controller = branch_scene.instantiate()
		root.add_child(branch)
		await process_frame
		branch.monster.take_damage(branch.monster.max_health)
		branch.player.global_position = branch.chest.global_position + Vector3(0.0, 0.0, 1.2)
		_check(branch.try_open_chest(), "%s 分支可进入开箱选择" % choice)
		_check(branch.choose_loot(choice), "%s 是可执行的 loot choice" % choice)
		_check(branch.carried_item == choice_expectations[choice]["item"] and branch.carried_value == choice_expectations[choice]["value"], "%s 分支写入对应携带状态" % choice)
		_cleanup_scene_audio(branch)
		await create_timer(0.08).timeout
		branch.free()
		await process_frame
		branch_scene = null

	_check(AudioServer.get_bus_index(&"Music") >= 0, "Music 音频总线存在")
	_check(AudioServer.get_bus_index(&"Ambience") >= 0, "Ambience 音频总线存在")
	_check(AudioServer.get_bus_index(&"SFX") >= 0, "SFX 音频总线存在")
	_check(AudioServer.get_bus_index(&"UI") >= 0, "UI 音频总线存在")

	_cleanup_scene_audio(segment)
	await create_timer(0.08).timeout
	segment.free()
	scene = null
	await process_frame
	_finish()


func _find_nodes_of_type(parent: Node, type_name: String) -> Array[Node]:
	var matches: Array[Node] = []
	for child in parent.get_children():
		if child.is_class(type_name):
			matches.append(child)
		matches.append_array(_find_nodes_of_type(child, type_name))
	return matches


func _cleanup_scene_audio(parent: Node) -> void:
	for audio_node in _find_nodes_of_type(parent, "AudioStreamPlayer"):
		audio_node.stop()
		audio_node.stream = null
	for audio_node in _find_nodes_of_type(parent, "AudioStreamPlayer3D"):
		audio_node.stop()
		audio_node.stream = null


func _finish() -> void:
	if failures.is_empty():
		print("SEGMENT CONTRACT PASS: ", checks, " checks")
		quit(0)
	else:
		print("SEGMENT CONTRACT FAIL: ", failures.size(), " / ", checks)
		for failure in failures:
			print(" - ", failure)
		quit(1)
