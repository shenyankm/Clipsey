<template>
  <div class="tab-section about-section">
    <div class="about-container">
      <div class="about-header">
        <div class="about-header__content">
          <a-typography-title :level="4" class="about-header__title">{{ texts.aboutTitle }}</a-typography-title>
          <a-typography-text type="secondary" class="about-header__desc">{{ texts.aboutDescription }}</a-typography-text>
        </div>
      </div>

      <a-divider class="about-divider" />

      <div class="about-contacts">
        <div class="contact-section">
          <a-typography-text strong class="contact-section__title">{{ texts.contactEmailLabel }}</a-typography-text>
          <a :href="`mailto:${contactEmail}`" class="contact-link">
            <MailOutlined class="contact-link__icon" />
            <span>{{ contactEmail }}</span>
          </a>
        </div>

        <div class="contact-section">
          <a-typography-text strong class="contact-section__title">{{ texts.communityLabel }}</a-typography-text>
          <a-space direction="vertical" size="small" class="community-list">
            <div
              v-for="item in communityLinks"
              :key="item.label"
              class="community-item"
            >
              <component :is="item.icon" class="community-item__icon" />
              <div class="community-item__content">
                <div class="community-item__label">{{ item.label }}</div>
                <a-typography-text class="community-item__value">{{ item.value }}</a-typography-text>
              </div>
            </div>
          </a-space>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MailOutlined } from '@ant-design/icons-vue';
import type { Component } from 'vue';

type CommunityLink = {
  label: string;
  value: string;
  icon: Component;
};

defineProps<{
  texts: Record<string, string>;
  contactEmail: string;
  communityLinks: CommunityLink[];
}>();
</script>

<style scoped>
.tab-section {
  background: #fff;
  padding: 24px;
  border-radius: 8px;
}

.about-header {
  margin-bottom: 24px;
}

.about-header__content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.about-header__title {
  margin: 0;
  font-weight: 600;
}

.about-header__desc {
  line-height: 1.6;
}

.about-divider {
  margin: 24px 0;
}

.about-contacts {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.contact-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.contact-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #1677ff;
  text-decoration: none;
}

.contact-link__icon {
  font-size: 16px;
}

.community-list {
  width: 100%;
}

.community-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
}

.community-item__icon {
  font-size: 18px;
  color: #1677ff;
  flex-shrink: 0;
  margin-top: 2px;
}

.community-item__label {
  font-weight: 500;
}

.community-item__value {
  color: #595959;
}
</style>
