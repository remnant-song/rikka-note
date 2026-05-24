<template>
  <div class="my-3 border rounded-xl overflow-hidden bg-muted/20 shadow-sm border-border/50">
    <!-- Header -->
    <div class="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="p-1 bg-purple-500/10 rounded">
          <History class="h-3.5 w-3.5 text-purple-500" />
        </div>
        <span class="text-xs font-semibold">{{ t('record.chat.diffPreview.title') }}</span>
      </div>
      <div class="flex items-center gap-2">
        <Button 
          v-if="status === 'suggestion'"
          variant="outline" 
          size="xs" 
          class="h-7 px-3 text-[11px] border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500/50"
          @click="handleApply"
        >
          <Check class="h-3 w-3 mr-1" />
          {{ t('record.chat.diffPreview.apply') }}
        </Button>
        <Button 
          v-else
          variant="outline" 
          size="xs" 
          class="h-7 px-3 text-[11px] border-orange-500/30 text-orange-600 hover:bg-orange-500/10 hover:border-orange-500/50"
          @click="handleUndo"
        >
          <Undo2 class="h-3 w-3 mr-1" />
          {{ t('record.chat.diffPreview.undo') }}
        </Button>
      </div>
    </div>

    <!-- Diff Content -->
    <div class="max-h-[300px] overflow-y-auto font-mono text-[11px] leading-relaxed custom-scrollbar bg-zinc-950">
      <div v-for="(line, index) in diffLines" :key="index" 
        :class="[
          'px-3 flex gap-4 min-h-[1.5rem] items-center',
          line.type === 'added' ? 'bg-emerald-500/10' : 
          line.type === 'removed' ? 'bg-rose-500/10' : ''
        ]"
      >
        <span class="w-4 text-center select-none opacity-40">
          {{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : '' }}
        </span>
        <span :class="[
          'whitespace-pre-wrap break-all',
          line.type === 'added' ? 'text-emerald-400' : 
          line.type === 'removed' ? 'text-rose-400 line-through' : 'text-zinc-400'
        ]">
          {{ line.content }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Check, History, Undo2 } from 'lucide-vue-next';
import { useChatStore } from '@/stores/chat';
import { type Chat } from '@/db/chats';
import { useArticleStore } from '@/stores/article';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/composables/useI18n';
import { logger } from '@/utils/logger';

const props = defineProps<{
  messageId: number;
  original: string;
  proposed: string;
  isFullFile: boolean;
  status: 'suggestion' | 'applied';
}>();

const chatStore = useChatStore();
const articleStore = useArticleStore();
const { t } = useI18n();
const { success, error } = useToast();

// 简单的行 DIFF 逻辑
const diffLines = computed(() => {
  const oldLines = props.original.split('\n');
  const newLines = props.proposed.split('\n');
  
  const result: { type: 'added' | 'removed' | 'normal', content: string }[] = [];
  
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({ type: 'normal', content: oldLines[i] });
      i++; j++;
    } else {
      if (i < oldLines.length) {
        result.push({ type: 'removed', content: oldLines[i] });
        i++;
      }
      if (j < newLines.length) {
        result.push({ type: 'added', content: newLines[j] });
        j++;
      }
    }
  }
  return result;
});

// 更新消息元数据状态
const updateMessageMetadata = async (newStatus: 'suggestion' | 'applied') => {
    const chat = chatStore.chats.find((c: Chat) => c.id === props.messageId);
    if (chat && chat.content) {
        const updatedContent = chat.content.replace(
            /(<!-- rikka-edit-meta: \{.*?"status":\s*")(\w+)(".*?\} -->)/,
            '$1' + newStatus + '$3'
        );
        await chatStore.saveChat({
            ...chat,
            content: updatedContent
        }, true);
    }
};

const handleApply = async () => {
    try {
        if (!articleStore.activeFilePath) return;

        let finalContent = '';
        if (props.isFullFile) {
            finalContent = props.proposed;
        } else {
            const originalFull = articleStore.currentArticle;
            const target = props.original;
            
            if (originalFull.includes(target)) {
                finalContent = originalFull.replace(target, props.proposed);
            } else {
                error(t('record.chat.diffPreview.toast.applyFailedMissingText'));
                return;
            }
        }

        await articleStore.saveCurrentArticle(finalContent);
        await updateMessageMetadata('applied');
        
        success(t('record.chat.diffPreview.toast.applySuccess'));
    } catch (err) {
        logger.assistant.error('Failed to apply edit:', err);
        error(t('record.chat.diffPreview.toast.applyFailedWriteError'));
    }
};

const handleUndo = async () => {
    try {
        if (!articleStore.activeFilePath) return;

        let finalContent = '';
        if (props.isFullFile) {
            finalContent = props.original;
        } else {
            const currentFull = articleStore.currentArticle;
            const appliedText = props.proposed;
            
            if (currentFull.includes(appliedText)) {
                finalContent = currentFull.replace(appliedText, props.original);
            } else {
                error(t('record.chat.diffPreview.toast.undoFailedTextModified'));
                return;
            }
        }

        await articleStore.saveCurrentArticle(finalContent);
        await updateMessageMetadata('suggestion');
        
        success(t('record.chat.diffPreview.toast.undoSuccess'));
    } catch (err) {
        logger.assistant.error('Failed to undo edit:', err);
        error(t('record.chat.diffPreview.toast.undoFailedError'));
    }
};

</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(139, 92, 246, 0.2);
  border-radius: 10px;
}
</style>
