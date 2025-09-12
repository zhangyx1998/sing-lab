<script setup lang="ts">
import HorizontalDivision from '@src/layout/HorizontalDivision.vue';
import Menubar from '@src/MenuBar.vue';
import FootBar from '@src/FootBar.vue';
import Monitor from '@src/Monitor.vue';
import Scope from '@src/Scope.vue';
import Editor from '@src/components/Editor.vue';

import { ref } from 'vue';
import Music from '@lib/music';
const music = ref<null | Music>(null);
</script>

<template>
    <Menubar />
    <FootBar />
    <HorizontalDivision class="main-layout">
        <template #left>
            <div class="vertical-division">
                <Scope :music="music" />
                <Monitor />
            </div>
        </template>
        <template #right>
            <div class="editor-container" style="padding: 0">
                <Editor style="width: 100%; height: 100%;" @update:music="m => music = m" />
            </div>
        </template>
    </HorizontalDivision>
</template>

<style>
:root {
    --menu-bar-height: 60px;
    --foot-bar-height: 50px;
}

.menu-bar {
    top: 0;
    left: 0;
    width: 100vw;
    height: var(--menu-bar-height);
}

.foot-bar {
    bottom: 0;
    left: 0;
    width: 100vw;
    height: var(--foot-bar-height);
}

.main-layout {
    position: absolute;
    top: var(--menu-bar-height);
    bottom: var(--foot-bar-height);
    left: 0;
    right: 0;
    z-index: -1;
}

.vertical-division {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding: 0 !important;
}

.vertical-division>* {
    width: 100%;
    margin: 0;
    padding: 0 !important;
}
</style>
