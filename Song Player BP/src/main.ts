import { world, system } from "@minecraft/server";
import { HivemindAPI } from "api";

import "./commands";
import "./music_box";
import "./ui";


export const api = new HivemindAPI("SongPlayer", { logFailures: false });
const SONG_PLAYER_VERSION = "v0.1 BETA";
const INITIAL_MESSAGE = `§eThanks for installing §6Song Player ${SONG_PLAYER_VERSION}\n§pTo get started type §5/function connect\n§7Disable this msg in §d/song:settings`;
system.run(() => {
    const dimensions = ["overworld", "nether", "the_end"];
    for (const dimension of dimensions) {
        for (const entity of world.getDimension(dimension).getEntities()) {
            if (entity.typeId == "song:music_box_entity") entity.setProperty("song:is_playing", false);
        }
    }
})

world.afterEvents.playerSpawn.subscribe(() => {
    if (world.getPlayers().length == 1) {
        system.runTimeout(() => {
            if (world.getDynamicProperty("welcomeMessage") != false) {
                world.sendMessage(INITIAL_MESSAGE);
            }
        }, 60)
    }
})