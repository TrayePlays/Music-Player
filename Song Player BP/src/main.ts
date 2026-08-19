import { world, system } from "@minecraft/server";
import { HivemindAPI, ServerStatusResponse } from "api";

import "./commands";
import "./music_box";
import "./ui";



export const api = new HivemindAPI("SongPlayer", { logFailures: false, onConnect: () => initialConnect() });
const SONG_PLAYER_VERSION = 0.1;
const INITIAL_MESSAGE = `§eThanks for installing §6Song Player v${SONG_PLAYER_VERSION}\n§pTo get started type §5/function connect\n§7Disable this msg in §d/song:settings`;

system.run(() => {
    const dimensions = ["overworld", "nether", "the_end"];
    for (const dimension of dimensions) {
        for (const entity of world.getDimension(dimension).getEntities()) {
            if (entity.typeId == "song:music_box_entity") entity.setProperty("song:is_playing", false);
        }
    }
})

async function initialConnect() {
    const noUpdateMessage = world.getDynamicProperty("updateMessage") as boolean ?? false;
    if (noUpdateMessage == true) return;
    const updateReq = await api.sendHttpRequest("https://raw.githubusercontent.com/TrayePlays/Music-Player/main/version.json")

    if (updateReq.status == ServerStatusResponse.Success) {
        const data = JSON.parse(updateReq.getData()) as { version: number };
        if (data.version > SONG_PLAYER_VERSION) {
            world.sendMessage(`\n§cThis version of Song Player is outdated, Please update! §7(/song:settings to disable message)`);
        }
    }

}

world.afterEvents.playerSpawn.subscribe(() => {
    if (world.getPlayers().length == 1) {
        system.runTimeout(() => {
            if (world.getDynamicProperty("welcomeMessage") != false) {
                world.sendMessage(INITIAL_MESSAGE);
            }
        }, 60)
    }
})