extends Control
## КАРАВАН — Android vertical slice 0.1.
## Vector-drawn train, touch camera, wagon upgrades, salvage, trips, persistence.
## No external dependencies, network permissions or advertising SDKs.

const SAVE_PATH := "user://caravan_save_v1.json"
const BG := Color("0e1d2c")
const AMBER := Color("e2ab70")
const PALE := Color("ecdec8")
const MUTED := Color("b6aaa0")
const COLD := Color("4d656c")
const COPPER := Color("956b50")
const DARK := Color("18242c")
const MODULES := ["СКЛАД", "ЖИТЛО", "МАЙСТЕРНЯ"]
const PLACES := ["СТАНЦІЯ «ПОПІЛ»", "КІСТЯНИЙ МІСТ", "ПОКИНУТЕ ДЕПО", "МІДНИЙ ПЕРЕВАЛ", "ОСТАННІЙ СИГНАЛ"]
const COSTS := [45,55,65]
const PARTS := [Rect2(215,342,270,228),Rect2(493,342,270,228),Rect2(770,342,265,228)]

var scrap := 145
var fuel := 81
var food := 62
var crew := 6
var levels := [1,1,1]
var stage := 0
var explored := false
var travelling := false
var distance := 0.0
var t := 0.0
var offset := 0.0
var camera_x := 0.0
var selected := -1
var mouse_down := false
var moved := false
var last_mouse_x := 0.0
var down_x := 0.0
var hud: Label
var resource_hud: Label
var mission_hud: Label
var status_hud: Label
var module_panel: PanelContainer
var module_title: Label
var module_info: Label
var upgrade_button: Button
var go_button: Button
var salvage_button: Button
var title_overlay: PanelContainer
var station_message := "Станція небезпечна. Розвідайте місцевість."

func _ready() -> void:
    mouse_filter = Control.MOUSE_FILTER_PASS
    _load_game()
    _build_ui()
    _refresh()

func _process(delta: float) -> void:
    delta = minf(delta,0.05)
    t += delta
    if travelling:
        offset += 175.0 * delta
        distance += delta / 17.0
        if distance >= 1.0:
            _arrive()
        else:
            status_hud.text = "РУХ КАРАВАНУ · %d%%" % int(distance * 100.0)
    else:
        offset += delta * 0.5
    queue_redraw()

func _build_ui() -> void:
    var top := ColorRect.new()
    top.color = Color(0.025,0.052,0.072,0.88)
    top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
    top.custom_minimum_size.y = 72
    top.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(top)
    hud = _label(Vector2(24,12),Vector2(490,44),"КАРАВАН / ОСТАННЯ ДОРОГА",24,PALE)
    resource_hud = _label(Vector2(610,21),Vector2(635,30),"",17,AMBER)
    status_hud = _label(Vector2(27,98),Vector2(650,46),"",25,PALE)
    mission_hud = _label(Vector2(24,640),Vector2(560,58),"",17,PALE)
    var lower := ColorRect.new()
    lower.color = Color(0.03,0.066,0.085,0.83)
    lower.position = Vector2(0,622)
    lower.size = Vector2(1280,98)
    lower.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(lower)
    move_child(lower,0)
    _button(Vector2(1051,641),Vector2(201,54),"➤ В ДОРОГУ",func():_go(),true)
    go_button = get_child(get_child_count()-1) as Button
    _button(Vector2(847,641),Vector2(194,54),"⌕ ДОСЛІДИТИ",func():_scavenge())
    salvage_button = get_child(get_child_count()-1) as Button
    _button(Vector2(1192,340),Vector2(55,46),"→",func(): camera_x = clampf(camera_x+135.0,-95.0,400.0))
    _button(Vector2(1192,392),Vector2(55,46),"←",func(): camera_x = clampf(camera_x-135.0,-95.0,400.0))
    _button(Vector2(1192,444),Vector2(55,46),"⌖",func():camera_x = 0.0)
    module_panel = PanelContainer.new()
    module_panel.position = Vector2(940,125)
    module_panel.custom_minimum_size = Vector2(310,184)
    add_child(module_panel)
    var vb := VBoxContainer.new()
    module_panel.add_child(vb)
    var panel_style := StyleBoxFlat.new()
    panel_style.bg_color = Color(0.038,0.078,0.105,0.96)
    panel_style.border_color = Color("a98260")
    panel_style.set_border_width_all(2)
    panel_style.set_corner_radius_all(8)
    panel_style.content_margin_left = 15
    panel_style.content_margin_right = 15
    panel_style.content_margin_top = 12
    panel_style.content_margin_bottom = 12
    module_panel.add_theme_stylebox_override("panel",panel_style)
    module_title = Label.new()
    module_title.add_theme_font_size_override("font_size",24)
    module_title.add_theme_color_override("font_color",AMBER)
    vb.add_child(module_title)
    module_info = Label.new()
    module_info.add_theme_font_size_override("font_size",15)
    module_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    module_info.custom_minimum_size = Vector2(292,70)
    vb.add_child(module_info)
    upgrade_button = Button.new()
    _skin( upgrade_button, true)
    upgrade_button.pressed.connect(_upgrade)
    vb.add_child(upgrade_button)
    var close := Button.new()
    close.text = "✕"
    close.pressed.connect(func():_select(-1))
    vb.add_child(close)
    module_panel.hide()
    title_overlay = PanelContainer.new()
    title_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    title_overlay.modulate = Color(1,1,1,0.98)
    var clear_style := StyleBoxEmpty.new()
    title_overlay.add_theme_stylebox_override("panel",clear_style)
    add_child(title_overlay)
    var splash := TextureRect.new()
    splash.texture = load("res://assets/concept_cover.png")
    splash.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    splash.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
    splash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    splash.mouse_filter = Control.MOUSE_FILTER_IGNORE
    title_overlay.add_child(splash)
    var shade := ColorRect.new()
    shade.color = Color(0.02,0.04,0.07,0.82)
    shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
    title_overlay.add_child(shade)
    var screen := VBoxContainer.new()
    screen.alignment = BoxContainer.ALIGNMENT_CENTER
    screen.add_theme_constant_override("separation",16)
    title_overlay.add_child(screen)
    var logo := Label.new()
    logo.text = "К А Р А В А Н"
    logo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    logo.add_theme_font_size_override("font_size",66)
    logo.add_theme_color_override("font_color",PALE)
    screen.add_child(logo)
    var subtitle := Label.new()
    subtitle.text = "ОСТАННЯ ДОРОГА     ·     VERTICAL SLICE 0.1"
    subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    subtitle.add_theme_font_size_override("font_size",19)
    subtitle.add_theme_color_override("font_color",AMBER)
    screen.add_child(subtitle)
    var info := Label.new()
    info.text = "Світ закінчився. Колії залишилися.\nВедіть рухомий дім крізь забуті землі."
    info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    info.add_theme_font_size_override("font_size",21)
    screen.add_child(info)
    var begin := Button.new()
    begin.text = "РОЗПОЧАТИ ЕКСПЕДИЦІЮ"
    begin.custom_minimum_size = Vector2(400,56)
    _skin(begin,true)
    begin.pressed.connect(func():title_overlay.hide())
    screen.add_child(begin)
    var hint := Label.new()
    hint.text = "Дотик до вагона · дослідити станцію · покращити модуль · вирушити в рейс"
    hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    screen.add_child(hint)

func _label(at: Vector2,wh: Vector2,s: String,fs:int,col:Color) -> Label:
    var label := Label.new()
    label.position = at
    label.size = wh
    label.text = s
    label.add_theme_font_size_override("font_size",fs)
    label.add_theme_color_override("font_color",col)
    label.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(label)
    return label

func _button(at:Vector2,wh:Vector2,s:String,fn:Callable,accent := false) -> void:
    var b := Button.new()
    b.position = at
    b.size = wh
    b.text = s
    b.add_theme_font_size_override("font_size",17)
    if accent:
        b.add_theme_color_override("font_color",AMBER)
    _skin(b, accent)
    b.pressed.connect(fn)
    add_child(b)

func _skin(btn:Button,accent := false) -> void:
    for mode in ["normal","hover","pressed","disabled"]:
        var box := StyleBoxFlat.new()
        box.bg_color = Color("8c5234") if accent else Color("182b35")
        if mode == "hover":
            box.bg_color = Color("ab7348") if accent else Color("2d4552")
        if mode == "pressed":
            box.bg_color = Color("593823") if accent else Color("172128")
        if mode == "disabled":
            box.bg_color = Color("293037")
        box.border_color = Color("c7a175") if accent else Color("697b83")
        box.set_border_width_all(1)
        box.set_corner_radius_all(5)
        btn.add_theme_stylebox_override(mode,box)
    btn.add_theme_color_override("font_color",PALE)
    btn.add_theme_color_override("font_hover_color",Color.WHITE)

func _refresh() -> void:
    resource_hud.text = "МЕТАЛ %d   ◆ ПАЛИВО %d   ❖ ПРИПАСИ %d   ♟ %d" % [scrap,fuel,food,crew]
    status_hud.text = PLACES[stage % PLACES.size()] + (" · В ДОРОЗІ" if travelling else "")
    mission_hud.text = station_message
    if is_instance_valid(go_button):
        go_button.disabled = travelling or fuel < 10 or food < 5
        salvage_button.disabled = travelling or explored
        salvage_button.text = "✓ ДОСЛІДЖЕНО" if explored else "⌕ ДОСЛІДИТИ"
    if selected >= 0:
        var cost:int = COSTS[selected] + (levels[selected]-1) * 25
        module_title.text = MODULES[selected] + " · LVL %d" % levels[selected]
        module_info.text = ["Знайдені ресурси після розвідки: +10 за рівень.","Зниження витрат припасів за рейс.","Зниження витрат палива за рейс."][selected]
        upgrade_button.text = "МАКСИМУМ" if levels[selected] >= 5 else "ПОКРАЩИТИ · %d МЕТАЛУ" % cost
        upgrade_button.disabled = levels[selected] >= 5 or scrap < cost
    _save_game()

func _select(index:int) -> void:
    selected = index
    module_panel.visible = index >= 0
    _refresh()

func _scavenge() -> void:
    if explored or travelling:
        return
    var gained := 32+levels[0]*10
    var refill := 9+(stage*7)%12
    scrap += gained
    fuel += refill
    food += 6+(stage%3)*5
    explored = true
    station_message = "РОЗВІДКА: +%d МЕТАЛУ, +%d ПАЛИВА" % [gained,refill]
    _refresh()

func _go() -> void:
    if travelling or fuel < 10 or food < 5:
        return
    travelling = true
    distance = 0.0
    station_message = "Подолайте небезпечний шлях до наступної станції."
    _select(-1)
    _refresh()

func _arrive() -> void:
    travelling = false
    fuel = maxi(0,fuel-maxi(7,17-levels[2]*3))
    food = maxi(0,food-maxi(3,8-levels[1]*2))
    stage += 1
    explored = false
    distance = 0.0
    station_message = "НОВА СТАНЦІЯ: ОГЛЯНУТИ ТА ДОСЛІДИТИ"
    _refresh()

func _upgrade() -> void:
    if selected < 0:
        return
    var cost:int = COSTS[selected]+(levels[selected]-1)*25
    if levels[selected] >= 5 or scrap < cost:
        return
    scrap -= cost
    levels[selected] += 1
    station_message = "МОДУЛЬ ПОКРАЩЕНО ДО РІВНЯ %d" % levels[selected]
    _refresh()

func _save_game() -> void:
    var file := FileAccess.open(SAVE_PATH,FileAccess.WRITE)
    if file == null:
        return
    file.store_string(JSON.stringify({"scrap":scrap,"fuel":fuel,"food":food,"crew":crew,"levels":levels,"stage":stage,"explored":explored}))
    file.close()

func _load_game() -> void:
    if not FileAccess.file_exists(SAVE_PATH):
        return
    var data = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
    if not data is Dictionary:
        return
    scrap = int(data.get("scrap",145))
    fuel = int(data.get("fuel",81))
    food = int(data.get("food",62))
    crew = int(data.get("crew",6))
    var loaded_levels = data.get("levels",[1,1,1])
    if loaded_levels is Array and loaded_levels.size() == 3:
        levels = [clampi(int(loaded_levels[0]),1,5),clampi(int(loaded_levels[1]),1,5),clampi(int(loaded_levels[2]),1,5)]
    stage = maxi(0,int(data.get("stage",0)))
    explored = bool(data.get("explored",false))

func _gui_input(event:InputEvent) -> void:
    if title_overlay.visible:
        return
    if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            mouse_down = true
            moved = false
            down_x = event.position.x
            last_mouse_x = event.position.x
        else:
            if mouse_down and not moved:
                _pick_module(event.position)
            mouse_down = false
    elif event is InputEventMouseMotion and mouse_down:
        var dx:float = event.position.x-last_mouse_x
        if absf(event.position.x-down_x) > 8:
            moved = true
        camera_x = clampf(camera_x-dx,-95.0,400.0)
        last_mouse_x = event.position.x
    elif event is InputEventScreenTouch:
        if event.pressed:
            mouse_down = true
            moved = false
            down_x = event.position.x
            last_mouse_x = event.position.x
        else:
            if mouse_down and not moved:
                _pick_module(event.position)
            mouse_down = false
    elif event is InputEventScreenDrag:
        camera_x = clampf(camera_x-event.relative.x,-95.0,400.0)
        moved = true

func _pick_module(pos:Vector2) -> void:
    var x:float = pos.x+camera_x
    for i in range(3):
        if PARTS[i].has_point(Vector2(x,pos.y)):
            _select(i)
            return
    _select(-1)

# All gameplay visuals are generated from draw primitives so the project contains
# editable geometry, rather than using the painted splash as an unclickable scene.
func _draw() -> void:
    _draw_sky()
    _draw_ruins()
    _draw_ground()
    draw_set_transform(Vector2(-camera_x,0))
    for i in range(3):
        _draw_car(i)
    _draw_engine()
    _crew(1030,565,0.85)
    draw_set_transform(Vector2.ZERO)
    _draw_foreground()

func _rect(x:float,y:float,w:float,h:float,col:Color) -> void:
    draw_rect(Rect2(x,y,w,h),col)

func _line(a:Vector2,b:Vector2,col:Color,weight:=2.0) -> void:
    draw_line(a,b,col,weight,true)

func _poly(points:Array,col:Color) -> void:
    draw_colored_polygon(PackedVector2Array(points),col)

func _draw_sky() -> void:
    for y in range(0,720,8):
        var q:float = float(y)/720.0
        var col:Color = Color("122038").lerp(Color("c18468"),clampf(q*1.35,0,1))
        if q > 0.62:
            col = col.lerp(Color("323c42"),clampf((q-.62)*2.3,0,1))
        _rect(0,y,1280,8,col)
    for r in range(0,6):
        var rad:float = 115.0-float(r)*11.0
        draw_circle(Vector2(951,254),rad,Color(0.93,0.52,0.34,0.008))
    draw_circle(Vector2(951,254),62,Color("e7ae7f"))
    for layer in range(3):
        var pts:Array = [Vector2(0,720)]
        var shift:float = fmod(camera_x*(layer+1)*.10+offset*(layer+1)*.2,110.0)
        for i in range(-2,15):
            var x:float = i*116.0-shift
            var peak:float = 340+layer*56-absf(sin(float(i*7+layer*11)))*72/(layer+1)
            pts.append(Vector2(x,peak))
            pts.append(Vector2(x+60,390+layer*39))
        pts.append(Vector2(1280,720))
        _poly(pts,[Color("576272"),Color("3b4b57"),Color("2a3a45")][layer])

func _draw_ruins() -> void:
    var shift:float = fmod(camera_x*.35+offset*.23,750)
    for b in range(-1,4):
        var x:float = 130+b*750-shift
        _rect(x,324,284,160,Color("333a41"))
        _rect(x+13,311,260,17,Color("666157"))
        for j in range(3):
            _rect(x+28+j*80,370,48,119,Color("1e2d36"))
            _rect(x+22+j*80,363,60,8,Color("897661"))
        for j in range(4):
            _rect(x+11+j*83,270,15,109,Color("5a5852"))
            _rect(x+3+j*83,255,48,16,Color("49494b"))
        _poly([Vector2(x-55,257),Vector2(x+335,226),Vector2(x+335,242),Vector2(x-56,272)],Color("323d43"))
        draw_circle(Vector2(x+182,268),29,Color("514b45"))
        draw_circle(Vector2(x+182,268),24,Color("c4ad89"))
        _line(Vector2(x+182,268),Vector2(x+186,250),Color("2b353b"),3)
        _line(Vector2(x+182,268),Vector2(x+167,278),Color("2b353b"),4)
        for j in range(3):
            var lx:float = x+23+j*94
            _line(Vector2(lx,290),Vector2(lx,335),Color("423e3d"),2)
            draw_circle(Vector2(lx,339),7,AMBER)

func _draw_ground() -> void:
    _rect(0,528,1280,85,Color("4b4843"))
    for j in range(20):
        var bx:float = j*83-fmod(offset*.5,83)
        _poly([Vector2(bx,577),Vector2(bx+52,577),Vector2(bx+39,678),Vector2(bx-8,678)],Color("5b5043"))
    _rect(0,612,1280,108,Color("1d262c"))
    for i in range(2):
        var ry:float = 594+i*53
        _line(Vector2(0,ry),Vector2(1280,ry),Color("202b30"),13)
        _line(Vector2(0,ry-4),Vector2(1280,ry-4),Color("a0957b"),4)
    for i in range(30):
        var bx:float = i*45-fmod(offset*.7,45)
        _rect(bx,592,12,68,Color("594a3e"))

func _draw_wheel(x:float,y:float,r:float) -> void:
    draw_circle(Vector2(x,y),r+4,Color("101c22"))
    draw_circle(Vector2(x,y),r,Color("525352"))
    draw_circle(Vector2(x,y),r-5,Color("1b2933"))
    for i in range(7):
        var a:float = float(i)*TAU/7.0+offset*.02
        _line(Vector2(x,y),Vector2(x+cos(a)*(r-5),y+sin(a)*(r-5)),Color("887c69"),2)
    draw_circle(Vector2(x,y),5,AMBER)

func _chassis(x:float,w:float) -> void:
    _rect(x,553,w,24,Color("3a3c3d"))
    _line(Vector2(x,555),Vector2(x+w,555),Color("96846c"),4)
    _draw_wheel(x+44,592,25)
    _draw_wheel(x+w-44,592,25)
    for i in range(int(w/30)):
        draw_circle(Vector2(x+i*30+8,561),2,Color("b19b79"))

func _draw_car(i:int) -> void:
    var start:float = [220.0,497.0,774.0][i]
    var w:float = [259.0,259.0,255.0][i]
    var top:float = 381
    _chassis(start,w)
    _rect(start,top,w,170,Color("343e43"))
    _rect(start+12,top+12,w-24,137,Color("685444"))
    for yy in range(5):
        _line(Vector2(start+16,top+20+yy*26),Vector2(start+w-16,top+20+yy*26),Color("3b3531"),1)
    if i == 0:
        for k in range(5):
            _crate(start+24+(k%3)*65,top+100-(k/3)*42)
        _crew(start+197,top+63,.7)
    elif i == 1:
        for k in range(2):
            _rect(start+23,top+35+k*44,79,32,Color("533e34"))
            _rect(start+30,top+42+k*44,26,13,Color("ccb69a"))
        _rect(start+116,top+102,91,6,Color("9e8061"))
        _crew(start+195,top+57,.73)
        _crew(start+121,top+66,.69)
    else:
        _rect(start+27,top+90,94,30,Color("353e40"))
        for k in range(4):
            _rect(start+37+k*20,top+70,11,49,Color("7e7669"))
        _crew(start+120,top+61,.73)
        _crew(start+211,top+76,.6)
        if int(t*4)%5 == 0:
            for k in range(5):
                var angle:float = t*11+k*TAU/5
                _line(Vector2(start+128,top+107),Vector2(start+128+cos(angle)*17,top+107+sin(angle)*18),Color("f3be72"),2)
    # framing and warm lamps
    _rect(start,top-28,w,39,Color("3c4649"))
    _rect(start-3,top-28,w+6,8,Color("898270"))
    for k in range(int(w/41)):
        var xx:float=start+15+k*41
        _line(Vector2(xx,top+10),Vector2(xx,top+145),Color("89745d"),2)
        _rect(xx,top+24,5,5,Color("e2b578"))
    for k in range(6):
        _rect(start+k*42,top-54,24,18,Color("555c57"))
    _rect(start,top-53,w,19,Color("404b4c"))
    _line(Vector2(start,top-53),Vector2(start+w,top-53),Color("98907c"),3)
    for k in range(int(w/33)):
        _line(Vector2(start+k*33,top-53),Vector2(start+k*33,top-65),Color("657077"),2)
    if selected == i:
        draw_rect(Rect2(start-7,top-72,w+14,251),AMBER,false,3)

func _crate(x:float,y:float) -> void:
    _rect(x,y,48,31,Color("846c50"))
    draw_rect(Rect2(x,y,48,31),Color("c2a47a"),false,2)
    for k in range(3):
        _line(Vector2(x+5+k*18,y),Vector2(x+5+k*18,y+31),Color("b49a75"),2)

func _crew(x:float,y:float,s:float) -> void:
    var bob:float=sin(t*2+x*.07)*1.5
    draw_circle(Vector2(x,y+bob),5*s,Color("aa967c"))
    _rect(x-7*s,y+6*s+bob,14*s,22*s,Color("65706b"))
    _line(Vector2(x-7*s,y+14*s+bob),Vector2(x-10*s,y+26*s+bob),Color("777661"),3*s)
    _line(Vector2(x+7*s,y+14*s+bob),Vector2(x+10*s,y+26*s+bob),Color("777661"),3*s)
    _line(Vector2(x-3*s,y+26*s+bob),Vector2(x-5*s,y+39*s+bob),Color("303a3d"),4*s)
    _line(Vector2(x+3*s,y+26*s+bob),Vector2(x+5*s,y+39*s+bob),Color("303a3d"),4*s)
    _rect(x-8*s,y-8*s+bob,16*s,4*s,Color("454848"))

func _draw_engine() -> void:
    var x:float = 1051
    _chassis(x,310)
    _rect(x+24,418,266,134,Color("3b4548"))
    _rect(x+45,388,216,95,Color("596060"))
    for i in range(7):
        _rect(x+61+i*27,403,13,68,Color("354147"))
    _rect(x+18,346,68,132,Color("3c4447"))
    _rect(x+31,365,39,38,Color("bb905f"))
    _rect(x+35,370,32,25,Color("343638"))
    _rect(x+125,291,39,127,Color("30373a"))
    _rect(x+117,289,56,14,Color("817967"))
    _rect(x+239,334,32,64,Color("4a5152"))
    _poly([Vector2(x+279,401),Vector2(x+308,416),Vector2(x+345,537),Vector2(x+284,553)],Color("4a4946"))
    draw_circle(Vector2(x+300,455),35,Color("252e36"))
    draw_circle(Vector2(x+300,455),24,Color("cb9257"))
    draw_circle(Vector2(x+300,455),17,Color("ffdfa0"))
    for i in range(5):
        _line(Vector2(x+29+i*45,543),Vector2(x+69+i*43,548),Color("9c8064"),4)
    _poly([Vector2(x+286,547),Vector2(x+349,601),Vector2(x+298,606),Vector2(x+263,578)],Color("303b40"))
    for i in range(5):
        _line(Vector2(x+276+i*11,555),Vector2(x+294+i*11,592),Color("b19b7e"),3)
    # banner and lookout
    _line(Vector2(x+204,344),Vector2(x+204,257),Color("9f9180"),3)
    _poly([Vector2(x+204,262),Vector2(x+257+sin(t)*6,267),Vector2(x+249+sin(t)*6,295),Vector2(x+204,286)],Color("885044"))
    _crew(x+226,316,.75)
    for j in range(10):
        var sx:float = x+144+sin(t*.5+j*2)*17-j*8
        var sy:float = 292-j*11-sin(t*.8+j)*2
        draw_circle(Vector2(sx,sy),6+j*2,Color(0.65,0.69,0.71,0.10))

func _draw_foreground() -> void:
    for i in range(39):
        var x:float = i*35-fmod(offset*.51,35)
        var h:float = 6+absf(sin(i*3.7))*18
        _line(Vector2(x,680),Vector2(x+sin(t+i)*2,680-h),Color("82715a"),1)