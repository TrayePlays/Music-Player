import { CommandPermissionLevel, CustomCommandOrigin, CustomCommandParamType, CustomCommandResult, CustomCommandStatus, Player, PlayerPermissionLevel, system, world } from "@minecraft/server";
import { openSongBrowserUI, openSongManagerUI, openSongSettingsUI } from "ui";

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerCommand({
        name: "song:browse",
        description: "Opens the UI to browse through a list of songs",
        permissionLevel: CommandPermissionLevel.Any
    }, songBrowseCMD)
    customCommandRegistry.registerCommand({
        name: "song:manage",
        description: "Manages a song you currently are playing",
        permissionLevel: CommandPermissionLevel.Any,
    }, songManageCMD)
    customCommandRegistry.registerCommand({
        name: "song:settings",
        description: "Sets settings for the song player addon",
        permissionLevel: CommandPermissionLevel.Admin,
    }, songSettingsCMD)
})

function songBrowseCMD(origin: CustomCommandOrigin): CustomCommandResult {
    if (origin?.sourceEntity?.typeId != "minecraft:player") return { status: CustomCommandStatus.Failure, message: "Run this as a player!" }
    system.run(async () => {
        const player = origin.sourceEntity as Player;
        if (player.playerPermissionLevel == PlayerPermissionLevel.Operator || (world.getDynamicProperty("memberBrowse") as boolean ?? true) == true) {
            openSongBrowserUI(player);
        } else {
            player.sendMessage(`§cThe host of this world has disabled §6/song:browse§c for members`)
        }
    })
    return { status: CustomCommandStatus.Success };
}

function songManageCMD(origin: CustomCommandOrigin): CustomCommandResult {
    if (origin?.sourceEntity?.typeId != "minecraft:player") return { status: CustomCommandStatus.Failure, message: "Run this as a player!" }
    system.run(async () => {
        const player = origin.sourceEntity as Player;
        if (player.playerPermissionLevel == PlayerPermissionLevel.Operator || (world.getDynamicProperty("memberManage") as boolean ?? true) == true) {
            openSongManagerUI(player);
        } else {
            player.sendMessage(`§cThe host of this world has disabled §6/song:manage§c for members`)
        }
    })
    return { status: CustomCommandStatus.Success }
}

function songSettingsCMD(origin: CustomCommandOrigin): CustomCommandResult {
    if (origin?.sourceEntity?.typeId != "minecraft:player") return { status: CustomCommandStatus.Failure, message: "Run this as a player!" }
    system.run(async () => {
        const player = origin.sourceEntity as Player;
        openSongSettingsUI(player);
    })
    return { status: CustomCommandStatus.Success }
}