<template>
  <n-message-provider>
    <settings-view />
  </n-message-provider>
  
</template>

<script setup lang="ts">
import { NMessageProvider } from 'naive-ui';
import SettingsView from './components/SettingsView.vue';
</script>
