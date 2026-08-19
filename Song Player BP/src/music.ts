import { Block, Entity, MolangVariableMap, Player, system, Vector3, world } from "@minecraft/server";
import { InputKeys } from "rhythm";
import { decompressLZW, formatTime } from "utils";

export class MusicBox extends Entity {
    noteSpawnLocation?: Vector3;
    songTick?: number;
    currentSongName?: string;
    isPaused?: boolean;
    managing?: boolean;
    songSpeed?: number;
    loop?: boolean;
    songInterval?: number;
    volume?: number
    currentSongEvents?: MidiEvents
    skipTo?: (tick: number) => void;
    songCB?: () => void
}

export class MusicPlayer extends Player {
    rhythmGameHeight?: number
    rhythmGameLatestHit?: string
    rhythmGameStats?: { perfect: number, good: number, miss: number, notes: number, offbeat: number };
    rhythmGameColor?: { w: string, a: string, s: string, d: string }
    addNote?: (key: InputKeys, tick: number) => void;
    removeNote?: (tick: number, key?: InputKeys) => void
    currentNotes?: { key: InputKeys, tick: number }[];
    noteSpawnLocation?: Vector3;
    songTick?: number;
    currentSongName?: string;
    isPaused?: boolean;
    managing?: boolean;
    songSpeed?: number;
    loop?: boolean;
    songInterval?: number;
    volume?: number
    currentSongEvents?: MidiEvents
    skipTo?: (tick: number) => void;
    songCB?: () => void
}

export interface MidiEvents {
    ticks: Uint32Array;
    midis: Uint8Array;
    instruments: Uint8Array;
    velocities: Uint8Array;
    idx: number[];
}

export function _playMidi(player: MusicPlayer | MusicBox, events: MidiEvents, songTick?: number) {
    if (player.songInterval) {
        system.clearRun(player.songInterval)
    }
    const isMusicBox = player.typeId == "song:music_box_entity";
    const { ticks, midis, instruments, idx, velocities } = events;

    if (idx.length === 0) return;
    if (player.volume == undefined) player.volume = 0.5;
    player.currentSongEvents = events;
    player.songTick = 0;
    player.isPaused = false;
    let pos = 0;
    const lastTick = ticks[idx[idx.length - 1]];

    const songName = player.currentSongName ?? "Unknown";

    const BAR_LENGTH = 10;
    if (player.typeId == "song:music_box_entity") {
        player.setProperty("song:is_playing", true)
    }
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
        if (!isMusicBox) {
            while (pos < idx.length && ticks[idx[pos]] >= player.songTick! && ticks[idx[pos]] < nextTickBoundary) {
                const i = idx[pos];
                const midi = midis[i];
                const rgb = { red: Math.sin(midi / 64), green: (midi / 127), blue: 1 }
                if (player.isPaused != true) {
                    try {
                        const molang = new MolangVariableMap();
                        molang.setVector3("variable.direction", { x: 0, y: -1, z: 0 });
                        molang.setFloat("variable.particle_initial_speed", 5 * speed)
                        molang.setFloat("variable.max_lifetime", 1 / speed)
                        let head = player.location;
                        if (player.noteSpawnLocation != undefined) head = player.noteSpawnLocation
                        let loc = { x: head.x + (1 - (midi / 14)) + 3, y: head.y + 6.25, z: head.z + 3 };
                        if (isMusicBox) loc = { x: head.x + ((midi / (14 * 5))), y: head.y + 6.25, z: head.z };
                        molang.setColorRGB("variable.color", rgb)
                        player.dimension.spawnParticle("minecraft:creaking_heart_trail", loc, molang)
                    } catch { };
                }
                pos++;
            }
        }
        let once = false;
        let pastPos = findPosForTick(player.songTick! - 20)
        while (pastPos < idx.length && ticks[idx[pastPos]] >= player.songTick! - 20 && ticks[idx[pastPos]] < nextTickBoundary - 20) {
            const i = idx[pastPos];
            const midi = midis[i];
            const inst = instruments[i];
            const velo = velocities[i];
            const pitch = pitchToFloat(mapPitch(midi));
            const rgb = { red: Math.sin(midi / 64), green: (midi / 127), blue: 1 }

            const sound = mapInstrument(inst);
            if (player.isPaused != true) {
                player.dimension.playSound(sound, player.location, { pitch, volume: Math.pow(velo / 127, 2) * ((player.volume ?? 0.5)) });
                try {
                    const molang = new MolangVariableMap();
                    molang.setFloat("variable.size", 0.115)
                    let head = player.location;
                    if (player.noteSpawnLocation != undefined) head = player.noteSpawnLocation
                    let loc = { x: head.x + (1 - (midi / 14)) + 3, y: head.y + 1.75, z: head.z + 3 };
                    if (isMusicBox) {
                        const randomX = (Math.floor(Math.random() * 30) - 15) / 100
                        loc = { x: head.x + randomX, y: head.y + 1.75, z: head.z };
                    }
                    molang.setColorRGB("variable.note_color", rgb)
                    if (once == false) {
                        player.dimension.spawnParticle("song:note_particle", loc, molang);
                        if (isMusicBox) once = true;
                    }

                } catch { };
            }

            pastPos++;
        }

        if (system.currentTick % 20 == 0 && player.isPaused != true) {
            const percent = (player.songTick! - 20) / lastTick;
            const bar = buildBar(percent);
            for (const p of player.dimension.getEntities({ maxDistance: 5, location: player.location, type: "minecraft:player" })) {
                (p as Player).onScreenDisplay.setActionBar(`§7Playing: §f${songName}\n§8[§c${bar}§8] §8§l| §r§7${formatTime(Math.max(Math.round(player.songTick! / 20) - 1, 0))} / ${formatTime(Math.round(lastTick / 20))}`);
            }
        }

        if (pastPos >= idx.length) {
            if (player.loop) {
                player.skipTo!(0);
                return
            }
            if (player.managing) return player.isPaused = true;
            if (player.typeId == "song:music_box_entity") {
                player.setProperty("song:is_playing", false)
            }
            player.songTick = 0;
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

export function buildTempoMap(midi: any) {
    const tpq = midi.header.ticksPerBeat!;
    const tempoEvents = [];

    let tick = 0;
    let currentTempo = 500000;

    for (const evt of midi.tracks[0]) {
        tick += evt.deltaTime;

        if (evt.type === "setTempo") {
            currentTempo = evt.microsecondsPerBeat;
            tempoEvents.push({ tick, microsecondsPerBeat: currentTempo });
        }
    }

    if (tempoEvents.length === 0) {
        tempoEvents.push({ tick: 0, microsecondsPerBeat: 500000 });
    }

    return { tpq, tempoEvents };
}

export function loadMidi(player: MusicPlayer | MusicBox, song: string): MidiEvents | undefined {
    const meta = world.getDynamicProperty(`song|${song}|meta`) as number;
    if (!meta) return;
    let str = "";
    for (let i = 0; i < meta; i++) {
        const dp = `song|${song}|${i}`
        str += world.getDynamicProperty(dp)
    }
    
    try {
        player.currentSongName = song;

        const converted = decompressLZW(str)
        const parsed = JSON.parse(converted);
        const midi = convertMidi(parsed)

        return midi;
    } catch {
        return
    }
}

export function convertMidi(midi: any): MidiEvents {
    const tempoMap = buildTempoMap(midi);

    let totalNotes = 0;
    for (const track of midi.tracks) {
        for (const evt of track) {
            if (evt.type === "noteOn" && evt.velocity > 0) {
                totalNotes++;
            }
        }
    }

    const ticks = new Uint32Array(totalNotes);
    const midis = new Uint8Array(totalNotes);
    const instruments = new Uint8Array(totalNotes);
    const velocities = new Uint8Array(totalNotes);

    let i = 0;

    for (const track of midi.tracks) {
        let tick = 0;
        let inst = 0;

        for (const evt of track) {
            tick += evt.deltaTime;

            if (evt.type === "programChange") {
                inst = evt.programNumber;
            }

            if (evt.type === "noteOn" && evt.velocity > 0) {
                if (evt.channel == 9) {
                    inst = 128
                }
                const seconds = ticksToSeconds(tick, tempoMap);
                const t = Math.round(seconds * 20);

                ticks[i] = t;
                midis[i] = evt.noteNumber;
                instruments[i] = inst;
                velocities[i] = evt.velocity
                i++;
            }
        }
    }
    const idx = Array.from({ length: totalNotes }, (_, j) => j);
    idx.sort((a, b) => ticks[a] - ticks[b]);

    return { ticks, midis, instruments, idx, velocities };
}

export function ticksToSeconds(tick: number, tempoMap: any): number {
    const { tpq, tempoEvents } = tempoMap;

    let lastTick = 0;
    let micros = 0;
    let currentTempo = tempoEvents[0].microsecondsPerBeat;

    for (let i = 1; i < tempoEvents.length; i++) {
        const evt = tempoEvents[i];

        if (tick < evt.tick) break;

        micros += (evt.tick - lastTick) * currentTempo / tpq;
        lastTick = evt.tick;
        currentTempo = evt.microsecondsPerBeat;
    }

    micros += (tick - lastTick) * currentTempo / tpq;

    return micros / 1_000_000;
}

export function mapPitch(midiNote: number): number {
    return midiNote - 54;
}

export function pitchToFloat(semitones: number): number {
    return Math.pow(2, semitones / 12);
}

export function mapInstrument(i: number) {
    return instrumentMap[i] || instrumentMap.default;
}

const customInstrumentMap: Record<number | string, string> = {
    0: "note.bit", 1: "note.bit", 2: "note.bit", 3: "note.bit",
    4: "note.bit", 5: "note.bit", 6: "note.bit", 7: "note.bit",

    8: "midi.xylophone", 9: "midi.xylophone",
    10: "note.iron_xylophone", 11: "note.iron_xylophone",

    24: "midi.guitar", 25: "midi.guitar", 26: "midi.guitar",
    27: "midi.guitar", 28: "midi.guitar", 29: "midi.guitar",
    30: "midi.guitar", 31: "midi.guitar",

    40: "midi.pling", 41: "midi.pling", 42: "midi.pling",
    43: "midi.pling", 44: "midi.pling",

    56: "midi.trumpet", 57: "midi.trumpet",
    58: "midi.trumpet", 59: "midi.trumpet",

    64: "midi.flute", 65: "midi.flute",
    66: "midi.flute", 67: "midi.flute",

    32: "midi.bass", 33: "midi.bass",
    34: "midi.bass",

    35: "midi.bd",
    36: "midi.bd",

    37: "note.hat",
    38: "note.snare",
    39: "note.snare",

    80: "midi.bit", 81: "midi.bit", 82: "midi.bit", 83: "midi.bit",
    84: "midi.bit", 85: "midi.bit", 86: "midi.bit", 87: "midi.bit",

    104: "midi.banjo", 105: "midi.banjo",

    14: "midi.bell2", 112: "midi.bell2",

    128: "midi.bd",
    129: "note.snare",
    130: "note.hat",

    default: "midi.flute"
};

export const instrumentMap: Record<number | string, string> = {
    0: "note.harp", 1: "note.harp", 2: "note.harp", 3: "note.harp",
    4: "note.pling", 5: "note.pling", 6: "note.pling", 7: "note.pling",

    8: "note.xylophone", 9: "note.xylophone",
    10: "note.iron_xylophone", 11: "note.iron_xylophone",
    12: "note.iron_xylophone", 13: "note.xylophone",
    14: "note.bell", 15: "note.chime",

    16: "note.didgeridoo", 17: "note.didgeridoo", 18: "note.flute", 19: "note.flute",
    20: "note.flute", 21: "note.flute", 22: "note.flute", 23: "note.flute",

    24: "note.guitar", 25: "note.guitar", 26: "note.guitar", 27: "note.guitar",
    28: "note.guitar", 29: "note.guitar", 30: "note.guitar", 31: "note.guitar",

    32: "note.bass", 33: "note.bass", 34: "note.bass",
    35: "note.bd", 36: "note.bd", 37: "note.hat", 38: "note.snare", 39: "note.snare",

    40: "note.pling", 41: "note.pling", 42: "note.pling", 43: "note.pling",
    44: "note.pling", 45: "note.pling", 46: "note.harp", 47: "note.bd",

    48: "note.flute", 49: "note.flute", 50: "note.flute", 51: "note.flute",
    52: "note.harp", 53: "note.harp", 54: "note.didgeridoo", 55: "note.didgeridoo",

    56: "note.trumpet", 57: "note.trumpet_exposed", 58: "note.trumpet_weathered", 59: "note.trumpet_oxidized",
    60: "note.trumpet_exposed", 61: "note.trumpet_weathered", 62: "note.trumpet_oxidized", 63: "note.trumpet",

    64: "note.flute", 65: "note.flute", 66: "note.flute", 67: "note.flute",
    68: "note.flute", 69: "note.flute", 70: "note.flute", 71: "note.flute",

    72: "note.flute", 73: "note.flute", 74: "note.flute", 75: "note.flute",
    76: "note.flute", 77: "note.flute", 78: "note.chime", 79: "note.chime",

    80: "note.bit", 81: "note.bit", 82: "note.bit", 83: "note.bit",
    84: "note.bit", 85: "note.bit", 86: "note.bit", 87: "note.bit",

    88: "note.chime", 89: "note.chime", 90: "note.bit", 91: "note.bit",
    92: "note.bit", 93: "note.bit", 94: "note.bit", 95: "note.bit",

    96: "note.bit", 97: "note.bit", 98: "note.bit", 99: "note.bit",
    100: "note.bit", 101: "note.bit", 102: "note.cow_bell", 103: "note.bit",

    104: "note.banjo", 105: "note.banjo", 106: "note.guitar", 107: "note.guitar",
    108: "note.guitar", 109: "note.didgeridoo", 110: "note.flute", 111: "note.flute",

    112: "note.bell", 113: "note.cow_bell", 114: "note.cow_bell", 115: "note.bd",
    116: "note.bd", 117: "note.bd", 118: "note.bd", 119: "note.bd",

    120: "note.snare", 121: "note.hat", 122: "note.bit", 123: "note.bit",
    124: "note.bit", 125: "note.bit", 126: "note.bit", 127: "note.bit",

    128: "note.bd",
    129: "note.snare",
    130: "note.hat",

    default: "note.flute"
};