import { system, world } from "@minecraft/server";

export function getSearchTimeout() {
    return world.getDynamicProperty("requestTimeout") as number ?? 200
}

export function splitString(str: string, size = 32767): string[] {
    const chunks: string[] = [];

    for (let i = 0; i < str.length; i += size) {
        chunks.push(str.substring(i, i + size));
    }

    return chunks;
}

export function decodeHtml(text: string) {
    const entities: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#039;': "'",
        '&#39;': "'"
    };

    return text.replace(/&amp;|&lt;|&gt;|&quot;|&#039;|&#39;/g, (match) => entities[match]);
}

export function splitBytes(str: string, maxBytes = 32767): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    let currentByteCount = 0;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const code = char.charCodeAt(0);

        let byteLength = 1;
        if (code > 0x7f && code <= 0x7ff) byteLength = 2;
        else if (code > 0x7ff && code <= 0xffff) byteLength = 3;
        else if (code > 0xffff) byteLength = 4;
        if (currentByteCount + byteLength > maxBytes) {
            chunks.push(currentChunk);
            currentChunk = "";
            currentByteCount = 0;
        }

        currentChunk += char;
        currentByteCount += byteLength;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

export function compressLZW(str: string): string {
    const dict: Record<string, number> = {};
    for (let i = 0; i < 256; i++) dict[String.fromCharCode(i)] = i;

    let phrase = str[0] || "";
    let dictSize = 256;
    let result = "";

    for (let i = 1; i < str.length; i++) {
        const currChar = str[i];
        const phraseAndChar = phrase + currChar;
        if (dict[phraseAndChar] !== undefined) {
            phrase = phraseAndChar;
        } else {
            result += String.fromCharCode(dict[phrase]);
            dict[phraseAndChar] = dictSize++;
            phrase = currChar;
        }
    }
    if (phrase !== "") result += String.fromCharCode(dict[phrase]);
    return result;
}

export function decompressLZW(compressed: string): string {
    const dict: Record<number, string> = {};
    for (let i = 0; i < 256; i++) dict[i] = String.fromCharCode(i);

    let currChar = compressed[0] || "";
    let oldPhrase = currChar;
    let result = currChar;
    let dictSize = 256;

    for (let i = 1; i < compressed.length; i++) {
        const code = compressed.charCodeAt(i);
        let phrase = dict[code] !== undefined ? dict[code] : oldPhrase + currChar;

        result += phrase;
        currChar = phrase[0];
        dict[dictSize++] = oldPhrase + currChar;
        oldPhrase = phrase;
    }
    return result;
}


export async function sleep(ticks: number) {
    return system.waitTicks(ticks);
}

export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    const padded = secs < 10 ? `0${secs}` : secs;

    return `${mins}:${padded}`;
}

export function formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

    // Determine the correct unit tier index
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}