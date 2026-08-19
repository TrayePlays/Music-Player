import { GameMode, ItemStack, Player, system, Vector3, world } from "@minecraft/server";
import { openSongBrowserUI } from "ui";

world.afterEvents.playerInteractWithBlock.subscribe(({ beforeItemStack, player, block }) => {
    if (beforeItemStack?.typeId == "song:music_box") {
        const spawnedEntity = block.dimension.getEntities({ maxDistance: 5, closest: 1, type: "song:music_box_entity", location: block.location })[0]
        if (!spawnedEntity) return;
        block.dimension.playSound("place.wood", block.location)
        spawnedEntity.setDynamicProperty("initialLocation", spawnedEntity.location)
        spawnedEntity.setDynamicProperty("owner", player.id);
    }
})

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
    if (damagingEntity?.typeId != "minecraft:player") return;
    const player = damagingEntity as Player;
    if (hitEntity.typeId == "song:music_box_entity") {
        const ownerId = hitEntity.getDynamicProperty("owner") as string

        function breakBox() {
            try {
                if (player.getGameMode() != GameMode.Creative) hitEntity.dimension.spawnItem(new ItemStack("song:music_box"), hitEntity.location);
            } catch { };
            hitEntity.dimension.playSound("dig.wood", hitEntity.location)
            hitEntity.remove();
        }

        if (ownerId != undefined) {
            // setting for breaking boxes
            if (world.getDynamicProperty("breakMusicBoxRestricted") == true) {
                if (player.id == ownerId || player.getGameMode() == GameMode.Creative) {
                    breakBox();
                }
            } else {
                breakBox();
            }
        } else {
            breakBox();
        }
    }
})

system.runInterval(() => {
    const dimensions = ["overworld", "nether", "the_end"];
    for (const dimension of dimensions) {
        for (const entity of world.getDimension(dimension).getEntities({ type: "song:music_box_entity" })) {
            entity.getEffects().forEach((e) => {
                if (e.typeId != "minecraft:invisibility") entity.removeEffect(e.typeId);
            })
            const initialLocation = entity.getDynamicProperty("initialLocation") as Vector3;
            if (initialLocation == undefined) {
                entity.setDynamicProperty("initialLocation", entity.location)
                continue
            };
            if (JSON.stringify(entity.location) != JSON.stringify(initialLocation)) {
                try {
                    entity.dimension.spawnItem(new ItemStack("song:music_box"), entity.location);
                } catch { };
                entity.dimension.playSound("dig.wood", entity.location)
                entity.remove();
            }
            if (entity.dimension.getBlock(entity.location)?.typeId != "minecraft:air") {
                try {
                    entity.dimension.spawnItem(new ItemStack("song:music_box"), entity.location);
                } catch { };
                entity.dimension.playSound("dig.wood", entity.location)
                entity.remove();
            }
        }
    }
}, 10)

world.beforeEvents.playerInteractWithEntity.subscribe((data) => {
    const { target, player } = data
    if (target.typeId == "song:music_box_entity") {
        system.run(() => {
            openSongBrowserUI(player, target)
        })
    }
})