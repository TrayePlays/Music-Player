import { MolangVariableMap, Player, system } from "@minecraft/server";
import { CustomForm, DropdownItemData, ObservableBoolean, ObservableNumber, ObservableString } from "@minecraft/server-ui";
import { loadMidi, mapInstrument, mapPitch, MidiEvents, MusicPlayer, pitchToFloat } from "music";
import { formatTime } from "utils";

export enum InputKeys {
    w = "w",
    a = "a",
    s = "s",
    d = "d"
}

export function startRhythmGame(player: MusicPlayer, song: string) {
    const rhythmGameHeightScales = [37, 22, 14, 9];
    let wKey = player.getDynamicProperty("rhythmGameW") as string ?? "w"
    let aKey = player.getDynamicProperty("rhythmGameA") as string ?? "a"
    let sKey = player.getDynamicProperty("rhythmGameS") as string ?? "s"
    let dKey = player.getDynamicProperty("rhythmGameD") as string ?? "d"
    let rhythmGameHeight = player.getDynamicProperty("rhythmGameHeight") as number ?? 14;
    let rhythmGameHeightIndex = rhythmGameHeightScales.findIndex(v => v == rhythmGameHeight) == -1 ? 2 : rhythmGameHeightScales.findIndex(v => v == rhythmGameHeight);
    let midi = loadMidi(player, song);
    let old = "";
    let init = false
    let settings = false;

    if (midi == undefined) return player.sendMessage(`§cThis song is invalid! §7(Download another song!)`);

    const form = new CustomForm(player, "Rhythm Game");
    const spacerKey = " "
    const buttonData: { title: ObservableString, cb: () => void, vis: ObservableBoolean, disabled: ObservableBoolean, spacerVis: ObservableBoolean, dividerVis: ObservableBoolean }[] = [];
    const label1 = { title: new ObservableString(`${"\n".repeat(20)}${" ".repeat(34)}${wKey}      ${aKey}      ${sKey}      ${dKey}`.replaceAll(" ", spacerKey)), vis: new ObservableBoolean(false), dividerVis: new ObservableBoolean(false), spacerVis: new ObservableBoolean(false) }
    const dropdown1 = { title: new ObservableString("UI Scale"), value: new ObservableNumber(rhythmGameHeightIndex, { clientWritable: true }), items: [{ label: "60%", value: 0 }, { label: "80%", value: 1 }, { label: "100%", value: 2 }, { label: "Extra Large UI", value: 3 }] as DropdownItemData[], disabled: new ObservableBoolean(false), vis: new ObservableBoolean(false), description: new ObservableString("") }
    const textField1 = { title: new ObservableString("Type to start"), text: new ObservableString("", { clientWritable: true }), vis: new ObservableBoolean(false), disabled: new ObservableBoolean(false), description: new ObservableString("") }
    if (player.rhythmGameColor == undefined) player.rhythmGameColor = { w: "", a: "", s: "", d: "" };

    player.rhythmGameStats = { perfect: 0, good: 0, miss: 0, notes: 0, offbeat: 0 };
    player.rhythmGameLatestHit = ""
    form.spacer({ visible: label1.spacerVis });
    form.label(label1.title, { visible: label1.vis });
    form.divider({ visible: label1.vis });

    for (let i = 0; i < 3; i++) {
        const title = new ObservableString("")
        const cb = () => {
            console.warn("not updated cb")
        }
        const vis = new ObservableBoolean(false)
        const disabled = new ObservableBoolean(false)
        const spacerVis = new ObservableBoolean(false);
        const dividerVis = new ObservableBoolean(false);
        form.button(title, () => buttonData[i].cb(), { visible: vis, disabled })
        form.divider({ visible: dividerVis });
        form.spacer({ visible: spacerVis })
        buttonData.push({ title, cb, vis, disabled, spacerVis, dividerVis });
    }

    form.divider({ visible: label1.dividerVis });
    form.textField(textField1.title, textField1.text, { visible: textField1.vis, disabled: textField1.disabled, description: textField1.description });
    form.dropdown(dropdown1.title, dropdown1.value, dropdown1.items, {visible: dropdown1.vis, disabled: dropdown1.disabled, description: dropdown1.description});

    function initialForm() {
        player.rhythmGameLatestHit = ""
        init = false;
        const button1 = buttonData[0];
        dropdown1.vis.setData(false);
        label1.spacerVis.setData(false);
        label1.vis.setData(false);
        textField1.title.setData("Type to start");
        textField1.vis.setData(true);
        button1.disabled.setData(false);
        button1.vis.setData(true);
        button1.title.setData("Settings");
        button1.cb = () => {
            settings = true;
            settingsForm();
        }
    }

    function settingsForm() {
        textField1.title.setData(`Set your keys for the rhythm game!`)
        textField1.text.setData(`${wKey}${aKey}${sKey}${dKey}`)
        const button1 = buttonData[0];
        button1.title.setData("Save");
        button1.cb = () => {
            const str = textField1.text.getData();
            const newRhythmGameHeight = rhythmGameHeightScales[dropdown1.value.getData()]
            player.dimension.playSound("note.bell", player.location);
            player.setDynamicProperty("rhythmGameW", str.charAt(0));
            player.setDynamicProperty("rhythmGameA", str.charAt(1));
            player.setDynamicProperty("rhythmGameS", str.charAt(2));
            player.setDynamicProperty("rhythmGameD", str.charAt(3));
            player.setDynamicProperty("rhythmGameHeight", newRhythmGameHeight);
            wKey = str.charAt(0);
            aKey = str.charAt(1);
            sKey = str.charAt(2);
            dKey = str.charAt(3);
            rhythmGameHeight = newRhythmGameHeight;
            textField1.text.setData("");
            settings = false;
            initialForm();
        }
        dropdown1.vis.setData(true);
    }

    initialForm();

    player.currentNotes = [];
    textField1.text.subscribe((str) => {
        const button1 = buttonData[0];
        if (settings) {
            button1.disabled.setData(str.length != 4);
            return;
        }
        if (!init) {
            old = str;
            button1.vis.setData(false);
            startGame();
            init = true;
            return;
        }
        if (str.length != old.length + 1) {
            return old = str;
        }
        const newKey = str.charAt(old.length);
        let key = ""
        if (newKey == wKey) key = "w";
        if (newKey == aKey) key = "a";
        if (newKey == sKey) key = "s";
        if (newKey == dKey) key = "d";
        if (key == "") {
            return old = str;
        }
        const molang = new MolangVariableMap();
        molang.setFloat("variable.size", 0.115)
        const songTick = player.songTick!;
        const hitTick = songTick - rhythmGameHeight;
        if (player.rhythmGameColor == undefined) player.rhythmGameColor = { w: "§f", a: "§f", s: "§f", d: "§f" };
        const note = player.currentNotes!.filter(n => n.key === key && Math.abs(n.tick - (hitTick)) <= 5).sort((a, b) => Math.abs(a.tick - (hitTick)) - Math.abs(b.tick - (hitTick)))[0];
        const notePos = { x: player.location.x + (Object.values(InputKeys).findIndex(k => k == key) * 0.25) - 0.5, y: player.location.y + 2, z: player.location.z }
        if (note) {
            const clickTime = Math.abs(note.tick - hitTick);
            // console.warn(clickTime, note.key)
            // const clickTime = player.getItemCooldown(`rhythmGame${note.key.toUpperCase()}`);

            if (clickTime == 0) {
                // Perfect
                molang.setColorRGB("variable.note_color", { red: 0, green: 1, blue: 0 })
                player.rhythmGameColor![note.key] = `§a`;
                player.rhythmGameLatestHit = " ".repeat(38).replaceAll(" ", spacerKey) + `§aPerfect!`
                player.rhythmGameStats!.perfect++;
            } else if (clickTime > 0 && clickTime < 3) {
                // Good
                molang.setColorRGB("variable.note_color", { red: 0, green: 0.4, blue: 1 })
                player.rhythmGameColor![note.key] = `§9`;
                player.rhythmGameLatestHit = " ".repeat(43).replaceAll(" ", spacerKey) + `§9Good`
                player.rhythmGameStats!.good++;
            } else {
                // Offbeat
                molang.setColorRGB("variable.note_color", { red: 1, green: 0.4, blue: 0.4 })
                player.rhythmGameColor![note.key] = `§c`;
                player.rhythmGameLatestHit = " ".repeat(39).replaceAll(" ", spacerKey) + `§cOffbeat`
                player.rhythmGameStats!.offbeat++;
            }

            player.rhythmGameStats!.notes++;

            player.currentNotes = player.currentNotes?.filter(n => n != note);
            player.startItemCooldown(`colorKey${note.key.toUpperCase()}`, 2);
            player.startItemCooldown(`rhythmGame${key.toUpperCase()}`, 4);
        } else {
            molang.setColorRGB("variable.note_color", { red: 0.7, green: 0, blue: 0 })
            player.dimension.spawnParticle("song:note_particle", notePos, molang)
            player.rhythmGameColor![key as InputKeys] = `§4`;
            player.rhythmGameLatestHit = " ".repeat(44).replaceAll(" ", spacerKey) + `§4Miss`
            player.rhythmGameStats!.miss++;
            player.startItemCooldown(`colorKey${key.toUpperCase()}`, 2);
        }
        player.dimension.spawnParticle("song:note_particle", notePos, molang);
        old = str
    })

    function startGame() {
        label1.dividerVis.setData(true);
        label1.vis.setData(true);
        textField1.title.setData(`Input (type ${wKey} ${aKey} ${sKey} ${dKey} for arrows)`)
        midi = loadMidi(player, song);
        const lastTick = midi!.ticks[midi!.idx[midi!.idx.length - 1]];
        _playRhythmGameMidi(player, midi!)

        player.addNote = (key, tick) => {
            if (player.currentNotes == undefined) player.currentNotes = [];
            player.currentNotes?.push({ key, tick });
        }

        player.removeNote = (tick, key) => {
            if (player.currentNotes = undefined) player.currentNotes = [];
            if (key != undefined) player.currentNotes = player.currentNotes?.filter(n => n.tick != tick);
            else player.currentNotes = player.currentNotes?.filter(n => n.tick != tick && n.key != key);
        }

        function renderLabel() {
            if (player.rhythmGameColor == undefined) player.rhythmGameColor = { w: "§f", a: "§f", s: "§f", d: "§f" };
            if (player.currentNotes == undefined) player.currentNotes = [];
            let newLabel = ``
            for (let i = 0; i < rhythmGameHeight; i++) {
                const notes = player.currentNotes?.filter(n => n.tick == player.songTick! - i);
                if (notes) {
                    for (const note of notes) {
                        newLabel += `${" ".repeat(34)}${`${note.key == "w" ? `${wKey}      ` : "          "}${note.key == "a" ? `${aKey}      ` : "          "}${note.key == "s" ? `${sKey}      ` : "          "}${note.key == "d" ? `${dKey}      ` : "       "}`}`.replaceAll(" ", spacerKey)
                    }
                }
                newLabel += "\n"
            }

            newLabel += `${" ".repeat(34)}${player.rhythmGameColor[InputKeys.w]}${wKey}      ${player.rhythmGameColor[InputKeys.a]}${aKey}      ${player.rhythmGameColor[InputKeys.s]}${sKey}      ${player.rhythmGameColor[InputKeys.d]}${dKey}\n`.replaceAll(" ", spacerKey)
            newLabel += `\n${player.rhythmGameLatestHit ?? ""}\n\n§f------------ ${formatTime(Math.round(Math.max(player.songTick! - rhythmGameHeight, 0) / 20))} / ${formatTime(Math.round(lastTick / 20))} ------------\n`
            label1.title.setData(newLabel)
        }

        function finishGame() {
            label1.spacerVis.setData(true);
            label1.dividerVis.setData(false);
            const stats = player.rhythmGameStats!;
            const maxScore = (stats.notes * 5);
            const finalScore = (stats.perfect * 5) + (stats.good * 4) + (stats.offbeat) - (stats.miss);
            const totalHit = stats.perfect + stats.good;
            const totalNotHit = stats.notes + stats.miss;
            const button1 = buttonData[0];
            button1.title.setData("Play Again");
            button1.vis.setData(true);
            button1.cb = () => {
                textField1.text.setData("");
                old = ""
                initialForm();
            };
            label1.title.setData(`Stats for ${song}: \n\n§aPerfect: §f${stats.perfect} §7(+5)\n§9Good: §f${stats.good} §7(+3)\n§cOffbeat: §f${stats.offbeat} §7(+1)\n§4Miss: §f${stats.miss} §7(-1)\n§bAccuracy: §f${totalHit}/${totalNotHit} §7(${((totalHit / totalNotHit) * 100).toFixed(2)}%)\n\n§eFinal Score: §f${finalScore}/${maxScore} §7(${((finalScore / maxScore) * 100).toFixed(2)}%)${finalScore == maxScore ? `\n\n§6Great job dude!` : ``}`);
            label1.vis.setData(true);
            textField1.text.setData("");
            textField1.vis.setData(false);
            old = "";
        }

        const renderInterval = system.runInterval(() => {
            if (!form.isShowing()) {
                system.clearRun(renderInterval);
                if (player.songInterval) {
                    system.clearRun(player.songInterval)
                }
                player.songInterval = undefined;
                return;
            }
            if (player.songTick! == -1) {
                finishGame();
                system.clearRun(renderInterval);
                return;
            }
            if (player.currentNotes) {

                if (player.rhythmGameColor == undefined) player.rhythmGameColor = { w: "§f", a: "§f", s: "§f", d: "§f" };
                for (const note of player.currentNotes.filter(n => n.tick == player.songTick! - (rhythmGameHeight + 5))) {
                    const clickTime = player.getItemCooldown(`rhythmGame${note.key.toUpperCase()}`)
                    if (clickTime == 0) {
                        player.rhythmGameColor[note.key] = `§4`;
                        player.rhythmGameLatestHit = " ".repeat(44).replaceAll(" ", spacerKey) + `§4Miss`
                        player.rhythmGameStats!.miss++;
                    }
                    player.currentNotes = player.currentNotes?.filter(n => n != note);
                    player.rhythmGameStats!.notes++
                    player.startItemCooldown(`colorKey${note.key.toUpperCase()}`, 2);
                }
                for (const key of Object.values(InputKeys)) {
                    if (player.getItemCooldown(`colorKey${key.toUpperCase()}`) == 0) player.rhythmGameColor[key] = "§f"
                }
                renderLabel()
            }
        })
    }

    form.show();
}

function _playRhythmGameMidi(player: MusicPlayer, events: MidiEvents, songTick?: number) {
    if (player.songInterval) {
        system.clearRun(player.songInterval)
    }

    player.currentNotes = [];

    const { ticks, midis, instruments, idx, velocities } = events;

    if (idx.length === 0) return;
    const rhythmGameHeight = player.getDynamicProperty("rhythmGameHeight") as number ?? 22;
    player.rhythmGameStats = { perfect: 0, good: 0, miss: 0, notes: 0, offbeat: 0 };
    player.currentSongEvents = events;
    player.songTick = 0;

    let pos = 0;
    const lastTick = ticks[idx[idx.length - 1]];

    const songName = player.currentSongName ?? "Unknown";

    const BAR_LENGTH = 10;

    function buildBar(percent: number): string {
        const target = Math.round(percent * (BAR_LENGTH - 1));
        let out = "";
        for (let i = 0; i < BAR_LENGTH; i++) {
            out += (i === target) ? "o§7" : "-";
        }
        return out;
    }

    function findPosForTick(tick: number): number {
        let low = 0;
        let high = idx.length - 1;

        while (low <= high) {
            const mid = (low + high) >> 1;
            const t = ticks[idx[mid]];

            if (t < tick) low = mid + 1;
            else high = mid - 1;
        }

        return low;
    }

    player.skipTo = (tick: number) => {
        player.songTick = tick;
        pos = findPosForTick(tick);
    };

    if (songTick) {
        player.skipTo(songTick);
    }

    let interval = 0;
    player.songCB = () => {
        if (!player || !player.isValid) {
            system.clearRun(interval);
        }
        const speed = player.songSpeed ?? 1
        const nextTickBoundary = player.songTick! + speed;
        let added = false
        while (pos < idx.length && ticks[idx[pos]] >= player.songTick! && ticks[idx[pos]] < nextTickBoundary) {
            const i = idx[pos];
            const midi = midis[i];
            const rgb = { red: Math.sin(midi / 64), green: (midi / 127), blue: 1 }
            if (player.isPaused != true && added == false) {
                const keyArr = Object.values(InputKeys);
                const keyIndex = midi % 4
                const key = keyArr[keyIndex]
                player.addNote!(key, player.songTick!)
                added = true;
            }
            pos++;
        }
        let pastPos = findPosForTick(player.songTick! - rhythmGameHeight)
        while (pastPos < idx.length && ticks[idx[pastPos]] >= player.songTick! - rhythmGameHeight && ticks[idx[pastPos]] < nextTickBoundary - rhythmGameHeight) {
            const i = idx[pastPos];
            const midi = midis[i];
            const inst = instruments[i];
            const velo = velocities[i];
            const pitch = pitchToFloat(mapPitch(midi));
            const rgb = { red: Math.sin(midi / 64), green: (midi / 127), blue: 1 }

            const sound = mapInstrument(inst);
            if (player.isPaused != true) {
                player.dimension.playSound(sound, player.location, { pitch, volume: Math.pow(velo / 127, 2) });
            }

            pastPos++;
        }

        if (player.songTick! % 20 == 0) {
            const percent = player.songTick! / lastTick;
            const bar = buildBar(percent);
            for (const p of player.dimension.getEntities({ maxDistance: 5, location: player.location, type: "minecraft:player" })) {
                (p as Player).onScreenDisplay.setActionBar(`§7Playing: §f${songName}\n§8[§c${bar}§8] §8§l| §r§7${formatTime(Math.round(player.songTick! / 20))} / ${formatTime(Math.round(lastTick / 20))}`);
            }
        }

        if (pastPos >= idx.length) {
            if (player.loop) {
                player.skipTo!(0);
                return
            }
            if (player.managing) return;
            player.songTick = -1;
            system.clearRun(player.songInterval!);
            player.songInterval = undefined;
            // @ts-ignore
            events.ticks = null;
            // @ts-ignore
            events.midis = null;
            // @ts-ignore
            events.instruments = null;
            // @ts-ignore
            events.idx = null;
            player.currentSongEvents = undefined;
            return;
        }

        if (player.isPaused != true) player.songTick! = nextTickBoundary;
    }

    player.songInterval = system.runInterval(() => { player.songCB!() });

    interval = player.songInterval;
}