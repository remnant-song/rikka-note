<template>
  <div class="flex flex-col h-full w-full bg-background border-l">
    <ChatHeader />
    <ChatList />
    <ChatInput />
  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import ChatHeader from './chat/ChatHeader.vue'
import ChatList from './chat/ChatList.vue'
import ChatInput from './chat/ChatInput.vue'

const chatStore = useChatStore()
</script>
