<template>
  <n-config-provider>
    <n-message-provider>
      <popup-content />
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import PopupContent from './PopupContent.vue';
</script>
