<!-- ---------------------------------------------------
Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
This source code is licensed under the MIT license.
You may find the full license in project root directory.
---------------------------------------------------- -->

<script setup lang="ts">
import Music from '@lib/music';
import { ref } from 'vue';
const props = defineProps({
    music: {
        type: Music, optional: true
    }
})
const playing = ref(false);
async function play() {
    if (playing.value) return;
    const { music } = props;
    if (!music) return;
    playing.value = true;
    try {
        await music.play();
    } finally {
        playing.value = false;
    }
}
</script>

<template>
    <div class="menu-bar">
        <div class="logo">Sing Lab</div>
        <div class="spacer" style="flex-grow: 1"></div>
        <div class="menu-item">
            <button @click="play" :disabled="playing">PLAY</button>
        </div>
    </div>
</template>

<style scoped lang="scss">
button {
    background-color: #3a62a9;
    color: #fff;
    border: none;
    padding: 8px 16px;
    margin: 0 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    transition: background-color 0.3s;

    &[disabled=true] {
        background-color: #666;
        cursor: not-allowed;
    }
}

.menu-bar {
    display: flex;
    align-items: center;
    background-color: #222;
    color: #fff;
}

.logo {
    font-size: 24px;
    font-weight: bold;
    font-style: italic;
    font-family: 'Times New Roman', Times, serif;
    color: #fff;
    padding: 10px;
}
</style>
