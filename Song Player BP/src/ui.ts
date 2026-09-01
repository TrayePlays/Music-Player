import { system, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean, ObservableNumber, ObservableString, DropdownItemData, ModalFormData } from "@minecraft/server-ui";
import { ServerStatusResponse } from "api";
import { api } from "main";
import { loadMidi, _playMidi, MusicPlayer, MusicBox } from "music";
import { startRhythmGame } from "rhythm";
import { compressLZW, decodeHtml, formatBytes, getSearchTimeout, sleep, splitBytes } from "utils";

interface SongItem {
    title: string;
    notes: string;
    id: string;
}

const failedBrowserError = `§cFailed to send request! Run §e/function connect §7(if you are already connected make your timeout longer with /song:settings)`

function parseSongs(htmlString: string): SongItem[] {
    const results: SongItem[] = [];
    const regex = /class="preview"\s+title="([^"]+)"[^>]*>[^]*?class="info">([^<]+)<\/div>[^]*?href="\/([^"]+)"/g;
    let match;

    while ((match = regex.exec(htmlString)) !== null) {
        results.push({
            title: decodeHtml(match[1].trim()),
            notes: match[2].trim(),
            id: match[3].trim()
        })
    }

    return results;
}

async function downloadSong(id: string, title?: string, onProgress?: (chunk: number, total: number) => void): Promise<string> {
    return new Promise(async (resolve) => {
        let formatted = id;
        if (!id.startsWith("https://")) formatted = `https://onlinesequencer.net/${id}`

        if (!title) {
            const titleReq = await api.sendHttpRequest(formatted);

            if (titleReq.status != ServerStatusResponse.Success) resolve("Failed HTTP Request");

            const html = decodeHtml(titleReq.data);
            const titleMatch = html.match(/<span>(.*?)<\/span>/);
            title = titleMatch ? titleMatch[1] : "Unknown...";
        }

        const songReq = await api.sendMidiRequest(formatted, undefined, getSearchTimeout(), onProgress);

        if (songReq.status != ServerStatusResponse.Success) resolve("Failed MIDI Request");

        const lzw = compressLZW(songReq.data);
        const chunks = splitBytes(lzw);

        chunks.forEach((chunk, i) => {
            world.setDynamicProperty(`song|${title}|${i}`, chunk)
        })
        world.setDynamicProperty(`song|${title}|meta`, chunks.length);
        resolve("Done!");
    })
}

function renameSong(song: string, newName: string) {
    const meta = world.getDynamicProperty(`song|${song}|meta`) as number
    if (!meta) return false;
    for (let i = 0; i < meta; i++) {
        const dp = `song|${song}|${i}`
        const oldData = world.getDynamicProperty(dp)
        world.setDynamicProperty(dp);
        world.setDynamicProperty(`song|${newName}|${i}`, oldData);
    }
    world.setDynamicProperty(`song|${song}|meta`);
    world.setDynamicProperty(`song|${newName}|meta`, meta);
    return true;
}

function deleteSong(song: string) {
    const meta = world.getDynamicProperty(`song|${song}|meta`) as number;
    if (meta == undefined) return false;
    for (let i = 0; i < meta; i++) {
        world.setDynamicProperty(`song|${song}|${i}`);
    }
    world.setDynamicProperty(`song|${song}|meta`);
    return true;
}

export async function openSongBrowserUI(player: MusicPlayer, block?: MusicBox) {
    const form = new CustomForm(player, "Song Browser");
    const label1 = { title: new ObservableString("Search with one of the options: "), visible: new ObservableBoolean(true), spacer1: new ObservableBoolean(true), spacer2: new ObservableBoolean(false), spacer3: new ObservableBoolean(false) };
    const textField1 = { title: new ObservableString("Find"), text: new ObservableString("", { clientWritable: true }), vis: new ObservableBoolean(false), disabled: new ObservableBoolean(false), description: new ObservableString("") }
    const toggle1 = { title: new ObservableString(""), toggled: new ObservableBoolean(false, { clientWritable: true }), vis: new ObservableBoolean(false), disabled: new ObservableBoolean(false) }
    const dropdownData: DropdownItemData[] = [];
    const dropdown1 = { title: new ObservableString(""), value: new ObservableNumber(0, { clientWritable: true }), items: [{ label: "Newest", value: 0 }, { label: "Popular", value: 1 }, { label: "Oldest", value: 2 }] as DropdownItemData[], disabled: new ObservableBoolean(false), vis: new ObservableBoolean(false) }
    const buttonData: { title: ObservableString, cb: () => void, vis: ObservableBoolean, disabled: ObservableBoolean, spacerVis: ObservableBoolean, dividerVis: ObservableBoolean }[] = [];
    const songPlayer = block == undefined ? player : block
    const isMusicBox = block != undefined
    const max = 4;
    let alrSearching = false
    let downloaded = false;
    const findTextCB = (newText: string) => {
        if (!songData) return;
        if (newText != "") {
            const newSongData = songData.filter(s => s.title.toLowerCase().includes(newText.toLowerCase()));
            if (newSongData.length == 0) {
                textField1.description.setData(`Nothing found for ${newText}`);
                return;
            }
            textField1.description.setData(`Finding ${newText}`);
            activeSongData = newSongData;
        } else {
            textField1.description.setData(``);
            activeSongData = songData
        }
        loadPage(0);
        label1.title.setData(`Page ${0 + 1}/${Math.ceil(activeSongData.length / max)} (Total Loaded: ${Math.ceil(songData.length / max)})`)
    }

    let paramSearch = "&sort=1";
    let songData: SongItem[] | undefined
    let activeSongData: SongItem[]
    let dots = 0;
    let up = true;
    let page = 0;

    for (let i = 0; i < 3; i++) {
        dropdownData[i] = { label: new ObservableString(""), value: i };
    }

    form.spacer({ visible: label1.spacer1 });
    form.label(label1.title, { visible: label1.visible });
    form.spacer({ visible: label1.spacer2 })
    form.textField(textField1.title, textField1.text, { disabled: textField1.disabled, visible: textField1.vis, description: textField1.description });
    form.dropdown(dropdown1.title, dropdown1.value, dropdown1.items, { disabled: dropdown1.disabled, visible: dropdown1.vis });
    form.toggle(toggle1.title, toggle1.toggled, { disabled: toggle1.disabled, visible: toggle1.vis });
    form.spacer({ visible: label1.spacer3 });

    for (let i = 0; i < 9; i++) {
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

    form.show();

    // functions

    function allButtonSet(data: { title?: string, cb?: () => void, vis?: boolean, disabled?: boolean, spacerVis?: boolean, dividerVis?: boolean }) {
        for (const button of buttonData) {
            if (data.title != undefined) button.title.setData(data.title);
            if (data.cb != undefined) button.cb = data.cb;
            if (data.vis != undefined) button.vis.setData(data.vis);
            if (data.disabled != undefined) button.disabled.setData(data.disabled);
            if (data.spacerVis != undefined) button.spacerVis.setData(data.spacerVis);
            if (data.dividerVis != undefined) button.dividerVis.setData(data.dividerVis);
        }
    }

    function renameForm(song: SongItem, p = page) {
        allButtonSet({ vis: false });
        label1.title.setData("");
        textField1.text.unsubscribe(findTextCB);
        textField1.vis.setData(true);
        textField1.title.setData(`Rename`)
        textField1.text.setData(song.title);
        const button1 = buttonData[0];
        button1.title.setData("Change Name");
        button1.vis.setData(true);
        button1.cb = () => {
            let newSongData = song
            const newName = textField1.text.getData();
            const success = renameSong(song.title, newName);
            if (!success) return label1.title.setData("Failed to rename song! (is song deleted?)");
            newSongData.title = newName;
            showButtonSpecific(newSongData, p, true);
        }
        const button2 = buttonData[1];
        button2.title.setData("Back");
        button2.vis.setData(true);
        button2.cb = () => {
            showButtonSpecific(song, p, true);
        }
    }

    function deleteForm(song: SongItem, p = page) {
        allButtonSet({ vis: false });
        label1.title.setData(`Are you sure you want to delete ${song.title}?`);
        const button1 = buttonData[0];
        button1.title.setData("Yes");
        button1.vis.setData(true);
        button1.cb = () => {
            const success = deleteSong(song.title);
            if (!success) return label1.title.setData(`Failed to delete ${song.title}.`);
            const songs = world.getDynamicPropertyIds().filter(s => s.endsWith("meta"));
            const sData: SongItem[] = [];
            for (const song of songs) {
                sData.push({ title: song.split("song|")[1].split("|meta")[0], id: "", notes: "" })
            }
            if (downloaded) songData = sData;
            resetForm(p);
        }
        const button2 = buttonData[1];
        button2.title.setData("No");
        button2.vis.setData(true);
        button2.cb = () => {
            showButtonSpecific(song, p, true);
        }
    }

    function showButtonSpecific(song: SongItem, p = page, downloaded = false) {
        allButtonSet({ vis: false, disabled: false });
        buttonData[max + 1].dividerVis.setData(false);
        textField1.vis.setData(false);
        label1.spacer1.setData(true);
        label1.spacer2.setData(false);
        label1.spacer3.setData(true);
        const button1 = buttonData[0];
        label1.title.setData(`Song: ${song.title}${downloaded ? "" : song.notes == "-1" ? "" : `\nNote Count: ${song.notes}`}`);
        button1.title.setData(downloaded ? "Play" : "Download");
        button1.vis.setData(true);
        button1.cb = async () => {
            if (button1.title.getData() == "Download") {
                let percent = "0"
                label1.title.setData(`Downloading ${song.title} §7(Getting notes...)`)
                button1.disabled.setData(true);
                button5.disabled.setData(true);
                const ready = await downloadSong(song.id, song.title, (c, total) => {
                    percent = ((c / total) * 100).toFixed(0)
                    label1.title.setData(`Downloading ${song.title} §7(${percent}%)`)
                    player.onScreenDisplay.setActionBar(`Downloading ${song.title} §7(${percent}%)`)
                });
                if (ready != "Done!") {
                    const testReq = await api.sendPingRequest(getSearchTimeout());
                    if (testReq.status == ServerStatusResponse.Success) {
                        label1.title.setData(`§cFailed to download song.\n§7(invalid song)`)
                    } else {
                        label1.title.setData(`§cFailed to download song.\nAre you connected? §7(/function connect)`)
                    }
                    await sleep(50);
                    label1.title.setData(`Song: ${song.title}\nNote Count: ${song.notes}`)
                    button1.disabled.setData(false);
                    button5.disabled.setData(false);
                    return;
                }
                label1.title.setData(`Downloaded ${song.title}!`);
                button1.title.setData(`Play`);
                button1.disabled.setData(false);
                button2.vis.setData(true);
                button3.vis.setData(true);
                button4.vis.setData(true);
                button5.disabled.setData(false);
            } else {
                const songName = song.title

                const midi = loadMidi(songPlayer, songName);
                if (midi == undefined) {
                    allButtonSet({ disabled: true });
                    label1.title.setData(`§cEither this song is doesn't work or doesn't exist. Find another song!`)
                    await sleep(60);
                    label1.title.setData(`Song: ${song.title}`)
                    allButtonSet({ disabled: false });
                    return;
                }
                _playMidi(songPlayer, midi);
                form.close();
                openSongManagerUI(player, block);
            }
        }
        const button2 = buttonData[1];
        button2.vis.setData(downloaded);
        button2.title.setData("Rhythm Game");
        button2.cb = () => {
            form.close();
            const openInterval = system.runInterval(() => {
                if (form.isShowing()) {
                    form.close()
                } else {
                    system.clearRun(openInterval)
                    startRhythmGame(player, song.title);
                };
            })
        }
        const button3 = buttonData[2];
        button3.title.setData("Rename");
        button3.vis.setData(downloaded)
        button3.cb = () => {
            renameForm(song, p);
        }
        const button4 = buttonData[3];
        button4.title.setData("Delete");
        button4.vis.setData(downloaded)
        button4.spacerVis.setData(false);
        button4.cb = () => {
            deleteForm(song, p);
        }
        const button5 = buttonData[4];
        button5.title.setData("Back");
        button5.vis.setData(true);
        button5.cb = () => {
            if (song.notes == "-1") initialForm();
            else resetForm(p);
        };
    }

    async function loadPage(p: number) {
        if (!songData) return;
        if (alrSearching) return;
        // let localMax = (page * max) + max > songData.length ? songData.length % max : max;
        if (activeSongData[((p * max) + max) - 1] == undefined && downloaded == false) {
            let percent = "Fetching"
            label1.title.setData(`Loading More Pages... §7(Fetching)`);
            textField1.disabled.setData(true);
            for (let i = 0; i < max + 3; i++) {
                const button = buttonData[i];
                button.disabled.setData(true);
            }

            alrSearching = true;
            const browseReq = await api.sendHttpRequest(`https://onlinesequencer.net/sequences?start=${(p * max) + max}${paramSearch}`, {
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                }
            }, undefined, getSearchTimeout(), (c, total) => {
                percent = ((c / total) * 100).toFixed(0)
                label1.title.setData(`Loading More Pages... §7(${percent}%)`)
            });

            if (browseReq.status != ServerStatusResponse.Success) {
                form.close();
                player.sendMessage(failedBrowserError)
                return;
            }

            alrSearching = false;

            const newSongData = parseSongs(browseReq.getData())

            textField1.disabled.setData(false);
            for (let i = 0; i < max + 3; i++) {
                const button = buttonData[i];
                button.disabled.setData(false);
            }

            for (const song of newSongData) {
                songData.push(song);
            }

        }
        activeSongData = songData.filter(s => s.title.toLowerCase().includes(textField1.text.getData().toLowerCase()));

        const maxPage = Math.ceil(activeSongData.length / max)

        if (p > maxPage - 1) {
            p = maxPage - 1
            page = maxPage - 1
        }

        label1.title.setData(`Page ${page + 1}/${Math.ceil(activeSongData.length / max)} (Total Loaded: ${Math.ceil(songData.length / max)})`);

        const nextButton = buttonData[max];
        nextButton.cb = () => {
            page = p + 1;
            loadPage(page);
        };
        nextButton.disabled.setData(downloaded && (page + 1) == Math.ceil(activeSongData.length / max))

        const previousButton = buttonData[max + 1];
        previousButton.cb = () => {
            page = Math.max(p - 1, 0);
            loadPage(page);
        };
        previousButton.title.setData("Previous");
        previousButton.disabled.setData(p == 0);

        const backButton = buttonData[max + 2];
        backButton.title.setData("Back");
        backButton.vis.setData(true);

        for (let i = 0; i < max; i++) {
            const button = buttonData[i];
            if (i == max - 1) {
                button.spacerVis.setData(true);
            }

            button.vis.setData(true);
            const song = activeSongData[i + (p * max)];

            if (song == undefined) {
                button.title.setData(``)
                button.disabled.setData(true);
                continue;
            }

            button.title.setData(song.title);
            button.disabled.setData(false);
            button.cb = () => {
                showButtonSpecific(song, p, downloaded);
            }
        }
    }

    function resetForm(p = page) {
        if (songData == undefined) return
        dropdown1.vis.setData(false);
        textField1.vis.setData(true);
        textField1.title.setData("Find")
        label1.spacer2.setData(true);
        const maxPage = Math.ceil(songData.length / max)
        label1.title.setData(`Page ${p + 1}/${Math.ceil(activeSongData.length / max)} (Total Loaded: ${maxPage})`)
        for (let i = 0; i < max; i++) {
            const button = buttonData[i];
            if (i == max - 1) {
                button.spacerVis.setData(true);
            }

            button.vis.setData(true);
            const song = activeSongData[i + (p * max)];

            if (song == undefined) {
                button.title.setData(``)
                button.disabled.setData(true);
                continue;
            }

            button.title.setData(song.title);
            button.disabled.setData(false);
            button.cb = () => {
                showButtonSpecific(song, p, downloaded);
            }
        }

        const nextButton = buttonData[max];
        nextButton.cb = () => {
            page = p + 1;
            loadPage(page);
        };
        nextButton.title.setData("Next");
        nextButton.vis.setData(true);
        nextButton.disabled.setData(downloaded && p == maxPage - 1)
        nextButton.spacerVis.setData(false);

        const previousButton = buttonData[max + 1];
        previousButton.cb = () => {
            page = Math.max(p - 1, 0);
            loadPage(page);
        };
        previousButton.title.setData("Previous");
        previousButton.vis.setData(true);
        previousButton.disabled.setData(p == 0);
        previousButton.dividerVis.setData(true);
        const backButton = buttonData[max + 2];
        backButton.cb = () => {
            initialForm();
        }
        backButton.title.setData("Back");
        backButton.vis.setData(true);

        textField1.text.subscribe(findTextCB);
    }

    function searchForm(err?: string) {
        allButtonSet({ vis: false })
        dropdown1.title.setData(`Sort By`)
        dropdown1.vis.setData(true);
        label1.title.setData(err ? err : `Search`)
        label1.spacer1.setData(false);
        label1.spacer2.setData(true);
        textField1.vis.setData(true);
        textField1.title.setData("Type a song name or song id!");
        textField1.description.setData("");
        toggle1.vis.setData(true);
        toggle1.title.setData("Search for ID?")
        toggle1.toggled.setData(false);
        const button1 = buttonData[0];
        const button2 = buttonData[1];
        button1.title.setData("Search");
        button1.vis.setData(true);
        button1.cb = async () => {
            const usingId = toggle1.toggled.getData();
            const text = textField1.text.getData();
            if (text == "") return searchForm(`§cType something!`);
            dots = 0
            up = true
            dropdown1.vis.setData(false);
            label1.spacer2.setData(false);
            toggle1.vis.setData(false);
            textField1.description.setData(usingId ? `Searching for ID: ${text}` : `Finding ${text}`);
            textField1.vis.setData(false);
            if (!usingId) {
                const dropdownValue = dropdown1.value.getData();
                const sortNumbers = [1, 2, 4];
                paramSearch = `&search=${encodeURIComponent(text)}&sort=${sortNumbers[dropdownValue]}`;
                allButtonSet({ vis: false });
                let percent = "Fetching"
                label1.title.setData(`§7Searching for ${text} (Fetching)`)
                const formInterval = system.runInterval(() => {
                    if (!form.isShowing()) system.clearRun(formInterval);
                    if (up) {
                        dots++;
                        if (dots >= 3) up = false
                    } else {
                        dots--;
                        if (dots <= 0) up = true;
                    }
                    const title = label1.title.getData();
                    const searchingText = title.split(" (")[0];
                    const before = searchingText.includes(".") ? searchingText.split(".")[0] : searchingText;
                    label1.title.setData(before + ".".repeat(dots) + ` (${percent})`)
                }, 10)
                const browseReq = await api.sendHttpRequest(`https://onlinesequencer.net/sequences?${paramSearch}`, {
                    method: "GET",
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "en-US,en;q=0.9",
                    }
                }, undefined, getSearchTimeout(), (c, total) => {
                    percent = ((c / total) * 100).toFixed(0) + "%"
                    const title = label1.title.getData();
                    const searchingText = title.split(" (")[0];
                    const before = searchingText.includes(".") ? searchingText.split(".")[0] : searchingText;
                    label1.title.setData(before + ".".repeat(dots) + ` (${percent})`)
                })

                if (browseReq.status != ServerStatusResponse.Success) {
                    form.close();
                    player.sendMessage(failedBrowserError)
                    return;
                }

                songData = parseSongs(browseReq.getData());
                activeSongData = songData;

                system.clearRun(formInterval);
                if (songData.length == 0) {
                    textField1.text.setData("");
                    searchForm(`§cNo songs found for ${text}`);
                    return;
                }
                label1.spacer2.setData(true);
                label1.spacer3.setData(true);
                textField1.vis.setData(true);
                const previousButton = buttonData[max + 1];
                previousButton.vis.setData(true);
                previousButton.title.setData("Previous");
                previousButton.disabled.setData(true);
                resetForm();
            } else {
                allButtonSet({ vis: false });
                let percent = "Fetching";
                label1.title.setData(`§7Searching for ID: ${text} (Fetching)`)
                const formInterval = system.runInterval(() => {
                    if (!form.isShowing()) system.clearRun(formInterval);
                    if (up) {
                        dots++;
                        if (dots >= 3) up = false
                    } else {
                        dots--;
                        if (dots <= 0) up = true;
                    }
                    const title = label1.title.getData();
                    const searchingText = title.split(" (")[0];
                    const before = searchingText.includes(".") ? searchingText.split(".")[0] : searchingText;
                    label1.title.setData(before + ".".repeat(dots) + ` (${percent})`)
                }, 10)
                let formatted = text;
                if (!text.startsWith("https://")) formatted = `https://onlinesequencer.net/${text}`
                const browseReq = await api.sendHttpRequest(formatted, {
                    method: "GET",
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "en-US,en;q=0.9",
                    }
                }, undefined, getSearchTimeout(), (c, total) => {
                    percent = ((c / total) * 100).toFixed(0) + "%"
                    const title = label1.title.getData();
                    const searchingText = title.split(" (")[0];
                    const before = searchingText.includes(".") ? searchingText.split(".")[0] : searchingText;
                    label1.title.setData(before + ".".repeat(dots) + ` (${percent})`)
                })

                if (browseReq.status != ServerStatusResponse.Success) {
                    form.close();
                    player.sendMessage(failedBrowserError)
                    return;
                }

                const titleMatch = decodeHtml(browseReq.data).match(/<span>(.*?)<\/span>/);
                const title = titleMatch ? titleMatch[1] : "Unknown...";
                label1.spacer3.setData(true);
                system.clearRun(formInterval);
                showButtonSpecific({ title, id: text, notes: "-1" })
            }
        }
        button2.title.setData("Back")
        button2.vis.setData(true);
        button2.cb = () => {
            initialForm();
        }
    }

    // after

    function initialForm() {
        page = 0;
        downloaded = false
        dropdown1.vis.setData(false);
        toggle1.vis.setData(false);
        textField1.text.unsubscribe(findTextCB);
        textField1.text.setData("");
        textField1.title.setData("");
        textField1.vis.setData(false);
        label1.title.setData(`Storage used: ${formatBytes(world.getDynamicPropertyTotalByteCount(), 1)} / 10 MB${10_485_760 < world.getDynamicPropertyTotalByteCount() ? "\n§710 MB+ can cause issues" : ""}`);
        label1.spacer1.setData(true);
        label1.spacer2.setData(true);
        label1.spacer3.setData(false);
        allButtonSet({ vis: false, spacerVis: false, dividerVis: false, disabled: false, cb: () => { console.warn("not updated cb") } });
        for (let i = 0; i < 5; i++) {
            const button = buttonData[i];
            button.vis.setData(true);
        }
        const button1 = buttonData[0];
        const button2 = buttonData[1];
        const button3 = buttonData[2];
        const button4 = buttonData[3];
        const button5 = buttonData[4];
        const button6 = buttonData[5];
        button1.title.setData("Search");
        button1.cb = () => {
            searchForm();
        }
        button2.title.setData("Newest");
        button2.cb = async () => {
            dots = 0
            up = true
            label1.spacer2.setData(false)
            allButtonSet({ vis: false });
            paramSearch = "&sort=1"
            let progress = "Fetching";
            label1.title.setData(`Loading §7(Fetching)`)
            const formInterval = system.runInterval(() => {
                const title = label1.title.getData()
                if (!form.isShowing()) system.clearRun(formInterval);
                if (up) {
                    dots++;
                    if (dots >= 3) up = false
                } else {
                    dots--;
                    if (dots <= 0) up = true;
                }
                const loadingText = title.split(" §")[0];
                const before = loadingText.includes(".") ? loadingText.split(".")[0] : loadingText;
                label1.title.setData(before + ".".repeat(dots) + ` §7(${progress})`)
            }, 10)
            const browseReq = await api.sendHttpRequest(`https://onlinesequencer.net/sequences?${paramSearch}`, {
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                }
            }, undefined, getSearchTimeout(), (c, total) => {
                progress = ((c / total) * 100).toFixed(0) + "%"
                const title = label1.title.getData()
                const loadingText = title.split(" §")[0];
                const before = loadingText.includes(".") ? loadingText.split(".")[0] : loadingText;
                label1.title.setData(before + ".".repeat(dots) + ` §7(${progress})`)
            })

            if (browseReq.status != ServerStatusResponse.Success) {
                form.close();
                player.sendMessage(failedBrowserError)
                return;
            }

            songData = parseSongs(browseReq.getData());
            activeSongData = songData;

            system.clearRun(formInterval);
            label1.spacer2.setData(true);
            label1.spacer3.setData(true);
            textField1.vis.setData(true);
            const previousButton = buttonData[max + 1];
            previousButton.vis.setData(true);
            previousButton.title.setData("Previous");
            previousButton.disabled.setData(true);
            resetForm();
        }
        button3.title.setData("Popular");
        button3.cb = async () => {
            dots = 0
            up = true
            label1.spacer2.setData(false)
            allButtonSet({ vis: false });
            paramSearch = "&sort=2"
            let progress = "Fetching";
            label1.title.setData(`Loading §7(Fetching)`)
            const formInterval = system.runInterval(() => {
                const title = label1.title.getData()
                if (!form.isShowing()) system.clearRun(formInterval);
                if (up) {
                    dots++;
                    if (dots >= 3) up = false
                } else {
                    dots--;
                    if (dots <= 0) up = true;
                }
                const loadingText = title.split(" §")[0];
                const before = loadingText.includes(".") ? loadingText.split(".")[0] : loadingText;
                label1.title.setData(before + ".".repeat(dots) + ` §7(${progress})`)
            }, 10)
            const browseReq = await api.sendHttpRequest(`https://onlinesequencer.net/sequences?${paramSearch}`, {
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                }
            }, undefined, getSearchTimeout(), (c, total) => {
                progress = ((c / total) * 100).toFixed(0) + "%"
                const title = label1.title.getData()
                const loadingText = title.split(" §")[0];
                const before = loadingText.includes(".") ? loadingText.split(".")[0] : loadingText;
                label1.title.setData(before + ".".repeat(dots) + ` §7(${progress})`)
            })

            if (browseReq.status != ServerStatusResponse.Success) {
                form.close();
                player.sendMessage(failedBrowserError)
                return;
            }

            songData = parseSongs(browseReq.getData());
            activeSongData = songData;

            system.clearRun(formInterval);
            label1.spacer2.setData(true);
            label1.spacer3.setData(true);
            textField1.vis.setData(true);
            const previousButton = buttonData[max + 1];
            previousButton.vis.setData(true);
            previousButton.title.setData("Previous");
            previousButton.disabled.setData(true);
            resetForm();
        }
        button4.title.setData("Oldest");
        button4.cb = async () => {
            dots = 0
            up = true
            label1.spacer2.setData(false)
            allButtonSet({ vis: false });
            paramSearch = "&sort=4"
            let progress = "Fetching";
            label1.title.setData(`Loading §7(Fetching)`)
            const formInterval = system.runInterval(() => {
                const title = label1.title.getData()
                if (!form.isShowing()) system.clearRun(formInterval);
                if (up) {
                    dots++;
                    if (dots >= 3) up = false
                } else {
                    dots--;
                    if (dots <= 0) up = true;
                }
                const loadingText = title.split(" §")[0];
                const before = loadingText.includes(".") ? loadingText.split(".")[0] : loadingText;
                label1.title.setData(before + ".".repeat(dots) + ` §7(${progress})`)
            }, 10)
            const browseReq = await api.sendHttpRequest(`https://onlinesequencer.net/sequences?${paramSearch}`, {
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                }
            }, undefined, getSearchTimeout(), (c, total) => {
                progress = ((c / total) * 100).toFixed(0) + "%"
                const title = label1.title.getData()
                const loadingText = title.split(" §")[0];
                const before = loadingText.includes(".") ? loadingText.split(".")[0] : loadingText;
                label1.title.setData(before + ".".repeat(dots) + ` §7(${progress})`)
            })

            if (browseReq.status != ServerStatusResponse.Success) {
                form.close();
                player.sendMessage(failedBrowserError)
                return;
            }

            songData = parseSongs(browseReq.getData());
            activeSongData = songData;

            system.clearRun(formInterval);
            label1.spacer2.setData(true);
            label1.spacer3.setData(true);
            textField1.vis.setData(true);
            const previousButton = buttonData[max + 1];
            previousButton.vis.setData(true);
            previousButton.title.setData("Previous");
            previousButton.disabled.setData(true);
            resetForm();
        }
        const songs = world.getDynamicPropertyIds().filter(s => s.endsWith("meta")).sort();
        button5.title.setData("Downloaded")
        button5.disabled.setData(songs.length == 0)
        button5.spacerVis.setData(songPlayer.songInterval != undefined)
        button5.cb = () => {
            downloaded = true;
            dots = 0
            up = true
            label1.spacer2.setData(false)
            allButtonSet({ vis: false });
            const songs = world.getDynamicPropertyIds().filter(s => s.endsWith("meta")).sort();
            const sData: SongItem[] = [];
            for (const song of songs) {
                sData.push({ title: song.split("song|")[1].split("|meta")[0], id: "", notes: "" })
            }
            songData = sData;
            activeSongData = songData;

            label1.spacer2.setData(true);
            label1.spacer3.setData(true);
            textField1.vis.setData(true);
            const previousButton = buttonData[max + 1];
            previousButton.vis.setData(true);
            previousButton.title.setData("Previous");
            previousButton.disabled.setData(true);
            resetForm();
        }
        button6.title.setData("Manage")
        button6.vis.setData(songPlayer.songInterval != undefined);
        button6.cb = () => {
            form.close();
            const openInterval = system.runInterval(() => {
                if (form.isShowing()) {
                    form.close()
                } else {
                    system.clearRun(openInterval)
                    openSongManagerUI(player, block);
                };
            })
        }
    }
    initialForm();
}

export async function openSongManagerUI(player: MusicPlayer, block?: MusicBox) {
    const songPlayer = block == undefined ? player : block
    if (songPlayer.songInterval == undefined || songPlayer.currentSongEvents == undefined) {
        player.startItemCooldown("openBrowserDoubleClick", 30);
        player.sendMessage(`§cYou have no active song now! §7(click again to open browser)`);
        return false
    };
    const form = new CustomForm(player, "Song Manager")
    const songName = songPlayer.currentSongName!;
    const { ticks, idx, instruments, midis, velocities } = songPlayer.currentSongEvents;
    const lastTick = ticks[idx[idx.length - 1]]
    const second = Math.floor(songPlayer.songTick! / 20)
    let sliderPrev = second
    let slider2Prev = (songPlayer.volume ?? 0.5) * 100;
    let slider3Prev = songPlayer.songSpeed ?? 1;
    const slider1 = { value: new ObservableNumber(sliderPrev, { clientWritable: true }), min: new ObservableNumber(0), max: new ObservableNumber(lastTick / 20) }
    const slider2 = { value: new ObservableNumber(slider2Prev, { clientWritable: true }), min: new ObservableNumber(0), max: new ObservableNumber(300) }
    const slider3 = { value: new ObservableNumber(slider3Prev, { clientWritable: true }), min: new ObservableNumber(0.25), max: new ObservableNumber(2), step: 0.25 }
    const toggle1 = { title: new ObservableString("Loop?"), toggled: new ObservableBoolean(songPlayer.loop ?? false, { clientWritable: true }), vis: new ObservableBoolean(true), disabled: new ObservableBoolean(false) }
    const buttonData: { title: ObservableString, cb: () => void, vis: ObservableBoolean, disabled: ObservableBoolean, spacerVis: ObservableBoolean, dividerVis: ObservableBoolean }[] = [];
    const formInterval = system.runInterval(() => {
        if (!form.isShowing()) {
            system.clearRun(formInterval)
            songPlayer.managing = false;
            return;
        }
        if (!songPlayer.songInterval || !songPlayer.currentSongEvents) {
            system.clearRun(formInterval)
            // player.sendMessage(`No song active rn`);
            songPlayer.managing = false;
            form.close();
            return;
        }
        songPlayer.managing = true;
        sliderPrev = slider1.value.getData();
        slider1.value.setData(Math.floor(songPlayer.songTick! / 20));
    }, 20)

    songPlayer.managing = true;

    slider1.value.subscribe((val) => {
        if (val - sliderPrev != 1) {
            songPlayer.skipTo!(val * 20);
        }
    })

    slider2.value.subscribe((val) => {
        songPlayer.volume = (val / 100);
    })

    slider3.value.subscribe((val) => {
        songPlayer.songSpeed = val;
    })

    form.spacer();
    form.label(`Manage ${songName}`);
    form.spacer();
    form.slider("Timeline", slider1.value, slider1.min, slider1.max);
    form.slider("Volume", slider2.value, slider2.min, slider2.max);
    form.slider("Speed", slider3.value, slider3.min, slider3.max, { step: slider3.step });
    form.toggle(toggle1.title, toggle1.toggled, { disabled: toggle1.disabled, visible: toggle1.vis });

    toggle1.toggled.subscribe((value) => {
        songPlayer.loop = value;
    })

    for (let i = 0; i < 9; i++) {
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

    const button1 = buttonData[0];
    button1.title.setData(songPlayer?.isPaused != true ? "Pause" : "Play");
    button1.vis.setData(true);
    button1.cb = () => {
        if (songPlayer.isPaused == undefined || songPlayer.isPaused == false) {
            button1.title.setData("Play");
            block?.setProperty("song:is_playing", false);
            songPlayer.isPaused = true;
        } else {
            button1.title.setData("Pause");
            block?.setProperty("song:is_playing", true);
            songPlayer.isPaused = false;
        }
    }
    const button2 = buttonData[1];
    button2.title.setData("Stop");
    button2.vis.setData(true);
    button2.cb = () => {
        button1.vis.setData(false);
        if (songPlayer.songInterval != undefined) {
            system.clearRun(songPlayer.songInterval)
            if (songPlayer.typeId == "song:music_box_entity") {
                songPlayer.setProperty("song:is_playing", false)
            }
            songPlayer.songInterval = undefined;
            form.close();
            button2.title.setData("Play");
        } else {
            button1.vis.setData(true);
            button2.title.setData("Stop");
            _playMidi(songPlayer, { idx, instruments, midis, ticks, velocities }, songPlayer.songTick);
        }
    }

    if (block == undefined) {
        const button3 = buttonData[2];
        button3.title.setData(songPlayer.noteSpawnLocation == undefined ? `Stationary` : "Move with me");
        button3.vis.setData(true);
        button3.cb = () => {
            if (songPlayer?.noteSpawnLocation == undefined) {
                songPlayer.noteSpawnLocation = songPlayer.location;
                button3.title.setData("Move with me");
            } else {
                songPlayer.noteSpawnLocation = undefined;
                button3.title.setData("Stationary");
            }
        }
    }

    form.show();
}

export async function openSongSettingsUI(player: MusicPlayer) {
    const form = new ModalFormData();
    form.title("Settings");
    form.toggle("Turn off welcome message?", { defaultValue: world.getDynamicProperty("welcomeMessage") as boolean ?? false });
    form.toggle("Only owners and creative can break music boxes?", { defaultValue: world.getDynamicProperty("breakMusicBoxRestricted") as boolean ?? false });
    form.toggle("Members allowed to use /song:browse", { defaultValue: world.getDynamicProperty("memberBrowse") as boolean ?? true });
    form.toggle("Members allowed to use /song:manage", { defaultValue: world.getDynamicProperty("memberManage") as boolean ?? true });
    form.toggle("Remove Update Message", { defaultValue: world.getDynamicProperty("updateMessage") as boolean ?? false });
    form.slider("Request Timeout", 3, 45, { defaultValue: (world.getDynamicProperty("requestTimeout") as number ?? 200) / 20, tooltip: "The time before a request times out. §7(If you have issues with requests, set the delay higher)" });
    form.submitButton("Save");
    const { canceled, formValues } = await form.show(player)
    if (canceled || formValues == undefined) return;
    player.sendMessage(`§aUpdated settings!`)
    world.setDynamicProperty("welcomeMessage", formValues[0]);
    world.setDynamicProperty("breakMusicBoxRestricted", formValues[1]);
    world.setDynamicProperty("memberBrowse", formValues[2]);
    world.setDynamicProperty("memberManage", formValues[3]);
    world.setDynamicProperty("updateMessage", formValues[4]);
    world.setDynamicProperty("requestTimeout", (formValues[5] as number) * 20);
}

world.afterEvents.itemUse.subscribe(async ({ itemStack, source: player }) => {
    if (itemStack.typeId == "song:browse") {
        openSongBrowserUI(player);
    }
    if (itemStack.typeId == "song:manage") {
        if (player.getItemCooldown("openBrowserDoubleClick") != 0) {
            player.startItemCooldown("openBrowseDoubleClick", 0);
            openSongBrowserUI(player);
            return;
        }
        openSongManagerUI(player);
    }
    if (itemStack.typeId == "minecraft:torch") {
        const now = Date.now();
        console.warn("Ping sent");
        const ping = await api.sendPingRequest(getSearchTimeout());
        const pingTime = Date.now() - now;
        console.warn("Successful ping: " + pingTime);
    }
    if (itemStack.typeId == "minecraft:diamond") {
        const now = Date.now();
        console.warn("Word get request sent")
        const wordReq = await api.sendHttpRequest("https://raw.githubusercontent.com/DO-Ui/BombpartyBot/refs/heads/main/pre-built/BombpartyBot-windows/wordlist.txt", {}, undefined, getSearchTimeout(), (c, total) => {
            player.onScreenDisplay.setActionBar(`Progress: ${((c / total) * 100).toFixed(1)}% (${c}/${total})`);
        })
        console.warn(`Success: ${Date.now() - now}ms | ${wordReq.data.length}`);
    }
})