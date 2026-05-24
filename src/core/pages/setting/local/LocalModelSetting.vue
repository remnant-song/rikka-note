<template>
  <div class="space-y-8 pb-10">
    <!-- Header: 标题、描述 -->
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b">
      <div class="space-y-1.5 flex-1">
        <h3 class="text-2xl font-bold tracking-tight text-foreground">{{ t('settings.local.title') }}</h3>
        <p class="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {{ t('settings.rag.localModelDesc') }}
        </p>
      </div>
    </div>

    <!-- 1. 推理引擎管理 (全局) -->
    <div class="flex flex-col space-y-4 p-6 border-2 border-primary/10 rounded-3xl bg-card shadow-sm relative overflow-hidden group">
      <div class="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-500">
        <Cpu class="w-24 h-24" />
      </div>
      
      <div class="flex items-center gap-3 font-bold text-xl text-card-foreground !mt-0">
        <div class="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-inner">
          <Cpu class="w-6 h-6" />
        </div>
        {{ t('settings.rag.engineTitle') }}
      </div>

      <div class="grid md:grid-cols-2 gap-6 items-end">
        <div class="space-y-2.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 pl-1">{{ t('settings.rag.engineVersion') }}</Label>
          <Select :model-value="selectedEngineName" @update:model-value="selectedEngineName = $event as string">
            <SelectTrigger class="h-11 rounded-xl border-muted-foreground/20 bg-muted/20 hover:bg-muted/40 transition-colors">
              <SelectValue :placeholder="t('settings.rag.selectEngineVersion')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="e in engineOptions" :key="e.name" :value="e.name" class="rounded-lg">
                {{ e.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex justify-end">
            <div v-if="detectedGpu" class="text-[10px] font-bold text-emerald-600 flex items-center bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 shadow-sm animate-in fade-in zoom-in duration-300">
              <CheckCircle2 class="w-3 h-3 mr-1" /> {{ t('settings.rag.gpuDetectedRecommend', { gpu: detectedGpu }) }}
            </div>
          </div>
          <div class="flex items-center gap-3">
            <Button @click="downloadEngine" :disabled="isEngineDownloading || (embeddingState.isEngineExists || chatState.isEngineExists)" variant="secondary" class="flex-1 h-11 font-bold rounded-xl shadow-sm hover:shadow transition-all">
              <Download v-if="!isEngineDownloading" class="w-4 h-4 mr-2" />
              <Loader2 v-else class="w-4 h-4 mr-2 animate-spin" />
              {{ (embeddingState.isEngineExists || chatState.isEngineExists) ? t('settings.rag.engineReady') : t('settings.rag.downloadAndConfigEngine') }}
            </Button>
          </div>
        </div>
      </div>

      <!-- 引擎下载进度条 -->
      <div v-if="isEngineDownloading" class="mt-4 space-y-2.5 p-4 rounded-2xl bg-muted/40 border-dashed border-2 animate-in slide-in-from-top-2 duration-300">
          <div class="flex justify-between items-center text-xs font-bold">
            <span class="flex items-center gap-2">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              {{ currentDownloadingEngineFile }}
            </span>
            <span v-if="engineDownloadTotal > 0" class="font-mono text-primary">
              {{ ((engineDownloadedBytes ?? 0) / 1024 / 1024).toFixed(1) }} / {{ ((engineDownloadTotal ?? 1) / 1024 / 1024).toFixed(1) }} MB
            </span>
          </div>
          <div class="w-full h-2 bg-muted/60 rounded-full overflow-hidden border shadow-inner">
            <div class="h-full bg-primary transition-all duration-300" :style="{ width: `${engineDownloadProgress}%` }"></div>
          </div>
      </div>
    </div>

    <!-- 2. Embedding 模型与服务 -->
    <div class="p-6 border rounded-3xl bg-card/50 shadow-sm space-y-6">
      <div class="flex items-center justify-between">
         <div class="flex items-center gap-3 font-bold text-lg">
            <div class="p-2 rounded-xl bg-orange-100 text-orange-600">
              <Bot class="w-5 h-5" />
            </div>
            {{ t('settings.rag.embeddingModelTitle') }}
         </div>
         <Switch
            id="local-embedding-switch"
            :model-value="settingStore.useLocalEmbedding"
            @update:model-value="settingStore.setUseLocalEmbedding($event)"
         />
      </div>

      <div v-if="settingStore.useLocalEmbedding" class="space-y-6 animate-in fade-in duration-300">
        <!-- 启动状态栏 -->
        <div class="flex flex-wrap items-center gap-3">
            <Button
              v-if="!embeddingState.isRunning"
              @click="startServer('embedding')"
              :disabled="!embeddingState.isFileExists || !embeddingState.isEngineExists || embeddingState.isStarting"
              class="rounded-xl h-10 px-6 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Loader2 v-if="embeddingState.isStarting" class="w-4 h-4 mr-2 animate-spin" />
              <Play v-else class="w-4 h-4 mr-2 fill-current" />
              {{ embeddingState.isStarting ? t('settings.rag.starting') : t('settings.rag.startEmbeddingService') }}
            </Button>
            <Button v-else variant="destructive" @click="stopServer('embedding')" class="rounded-xl h-10 px-6 font-bold shadow-lg shadow-red-600/10 active:scale-95 transition-all">
               <Square class="w-4 h-4 mr-2 fill-current" /> {{ t('settings.rag.stopServer') }}
            </Button>
            
            <div v-if="embeddingState.isRunning" class="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {{ t('settings.rag.onlineStatus', { url: `http://127.0.0.1:${settingStore.localEmbeddingPort}/v1/embeddings` }) }}
            </div>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <div class="flex flex-col gap-3">
            <Label class="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 pl-1">{{ t('settings.rag.modelPathConfig') }}</Label>
            <div class="flex gap-2">
              <Input 
                :model-value="settingStore.localEmbeddingModelStr" 
                @update:model-value="settingStore.setLocalEmbeddingModelStr($event as string)"
                :placeholder="t('settings.rag.modelPathConfig')"
                class="h-11 rounded-xl shadow-sm font-mono text-xs"
              />
              <Button variant="outline" size="icon" class="h-11 w-11 rounded-xl shrink-0" @click="selectModelFile('embedding')">
                <Folder class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div class="flex items-end gap-3">
             <Button @click="downloadModel('embedding')" :disabled="embeddingState.isDownloading || embeddingState.isFileExists" variant="secondary" class="flex-1 h-11 font-bold rounded-xl shadow-sm">
              <Download class="w-4 h-4 mr-2" /> 
              {{ embeddingState.isFileExists ? t('settings.rag.modelReady') : t('settings.rag.downloadPresetModel') }}
            </Button>
          </div>
        </div>

        <!-- 进度条 -->
        <div v-if="embeddingState.isDownloading" class="space-y-2.5 p-4 rounded-2xl bg-muted/40 border">
          <div class="flex justify-between items-center text-xs font-bold">
            <span class="flex items-center gap-2">{{ t('settings.rag.downloadingWithSize', { size: ((embeddingState.downloadedBytes ?? 0)/1024/1024).toFixed(1) }) }}</span>
            <span class="font-mono">{{ (embeddingState.downloadProgress ?? 0).toFixed(1) }}%</span>
          </div>
          <div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div class="h-full bg-primary transition-all duration-300" :style="{ width: `${embeddingState.downloadProgress}%` }"></div>
          </div>
        </div>

        <!-- 高级配置 (折叠) -->
        <div class="space-y-4">
          <button @click="showAdvancedEmbedding = !showAdvancedEmbedding" class="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors py-1">
            <ChevronDown :class="['w-4 h-4 transition-transform duration-300', showAdvancedEmbedding ? 'rotate-180' : '']" />
            {{ t('settings.rag.advancedConfig') }}
          </button>
          
          <div v-if="showAdvancedEmbedding" class="space-y-6 p-5 rounded-2xl bg-muted/30 border border-dashed animate-in slide-in-from-top-2 duration-300">
            <!-- 硬件分配 -->
            <div class="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.listenPort') }}</Label>
                  <span class="text-[10px] font-mono text-primary">{{ settingStore.localEmbeddingPort }}</span>
                </div>
                <Input type="number" :model-value="settingStore.localEmbeddingPort" @update:model-value="settingStore.setLocalEmbeddingPort(Number($event))" :disabled="embeddingState.isRunning" class="h-9 rounded-lg" />
              </div>
              
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.cpuThreads') }}</Label>
                  <span class="text-[10px] font-mono text-primary">{{ settingStore.localEmbeddingThreads }}</span>
                </div>
                <Slider :min="1" :max="32" :step="1" :model-value="[settingStore.localEmbeddingThreads]" @update:model-value="settingStore.setLocalEmbeddingThreads($event[0])" />
              </div>

              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.gpuLayers') }}</Label>
                  <span class="text-[10px] font-mono text-primary">{{ settingStore.localEmbeddingGpuLayers }}</span>
                </div>
                <Slider :min="0" :max="100" :step="1" :model-value="[settingStore.localEmbeddingGpuLayers]" @update:model-value="settingStore.setLocalEmbeddingGpuLayers($event[0])" />
              </div>
            </div>

            <!-- 模型特性 -->
            <div class="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.maxSeqLength') }}</Label>
                  <span class="text-[10px] font-mono text-primary">{{ settingStore.localEmbeddingMaxSeq }}</span>
                </div>
                <Slider :min="128" :max="2048" :step="128" :model-value="[settingStore.localEmbeddingMaxSeq]" @update:model-value="settingStore.setLocalEmbeddingMaxSeq($event[0])" />
              </div>

              <div class="space-y-3">
                <Label class="text-[10px] font-bold uppercase text-muted-foreground block">{{ t('settings.rag.poolingStrategy') }}</Label>
                <Select :model-value="settingStore.localEmbeddingPooling" @update:model-value="settingStore.setLocalEmbeddingPooling($event as string)">
                  <SelectTrigger class="h-9 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mean">Mean ({{ t('settings.rag.recommended') }})</SelectItem>
                    <SelectItem value="cls">CLS</SelectItem>
                    <SelectItem value="last">Last</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div class="flex items-center gap-2 pt-6">
                <Checkbox id="norm-check" :checked="settingStore.localEmbeddingNorm" @update:checked="settingStore.setLocalEmbeddingNorm($event)" />
                <Label for="norm-check" class="text-[10px] font-bold uppercase text-muted-foreground cursor-pointer">{{ t('settings.rag.vectorNormalization') }}</Label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 推理模型与服务 (Gemma 4 等) -->
    <div class="p-6 border rounded-3xl bg-card/50 shadow-sm space-y-6">
      <div class="flex items-center justify-between">
         <div class="flex items-center gap-3 font-bold text-lg">
            <div class="p-2 rounded-xl bg-purple-100 text-purple-600">
              <MessageSquareText class="w-5 h-5" />
            </div>
            {{ t('settings.rag.localChatModelTitle') }}
         </div>
         <Switch
            id="local-chat-switch"
            :model-value="settingStore.useLocalChat"
            @update:model-value="settingStore.setUseLocalChat($event)"
         />
      </div>

      <div v-if="settingStore.useLocalChat" class="space-y-6 animate-in fade-in duration-300">
        <!-- 启动状态栏 -->
        <div class="flex flex-wrap items-center gap-3">
            <Button
              v-if="!chatState.isRunning"
              @click="startServer('chat')"
              :disabled="!chatState.isFileExists || !chatState.isEngineExists || chatState.isStarting"
              class="rounded-xl h-10 px-6 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              <Loader2 v-if="chatState.isStarting" class="w-4 h-4 mr-2 animate-spin" />
              <Play v-else class="w-4 h-4 mr-2 fill-current" />
              {{ chatState.isStarting ? t('settings.rag.starting') : t('settings.rag.startChatService') }}
            </Button>
            <Button v-else variant="destructive" @click="stopServer('chat')" class="rounded-xl h-10 px-6 font-bold shadow-lg shadow-red-600/10 active:scale-95 transition-all">
               <Square class="w-4 h-4 mr-2 fill-current" /> {{ t('settings.rag.stopServer') }}
            </Button>
            
            <div v-if="chatState.isRunning" class="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {{ t('settings.rag.onlineStatus', { url: `http://127.0.0.1:${settingStore.localChatPort}` }) }}
            </div>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <div class="flex flex-col gap-3">
            <Label class="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 pl-1">{{ t('settings.rag.chatModelPathConfig') }}</Label>
            <div class="flex gap-2">
              <Input 
                :model-value="settingStore.localChatModelStr" 
                @update:model-value="settingStore.setLocalChatModelStr($event as string)"
                :placeholder="t('settings.rag.chatModelPathConfig')"
                class="h-11 rounded-xl shadow-sm font-mono text-xs"
              />
              <Button variant="outline" size="icon" class="h-11 w-11 rounded-xl shrink-0" @click="selectModelFile('chat')">
                <Folder class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div class="flex items-end gap-3">
             <Button @click="downloadModel('chat')" :disabled="chatState.isDownloading || chatState.isFileExists" variant="secondary" class="flex-1 h-11 font-bold rounded-xl shadow-sm hover:bg-muted-foreground hover:text-white transition-all">
              <Download class="w-4 h-4 mr-2" /> 
              {{ chatState.isFileExists ? t('settings.rag.modelReady') : t('settings.rag.downloadPresetModel') }}
            </Button>
          </div>
        </div>

        <!-- 进度条 -->
        <div v-if="chatState.isDownloading" class="space-y-2.5 p-4 rounded-2xl bg-muted/40 border">
          <div class="flex justify-between items-center text-xs font-bold">
            <span class="flex items-center gap-2">{{ t('settings.rag.modelDownloadingLarge') }}</span>
            <span class="font-mono">{{ (chatState.downloadProgress ?? 0).toFixed(1) }}%</span>
          </div>
          <div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div class="h-full bg-primary transition-all duration-300" :style="{ width: `${chatState.downloadProgress}%` }"></div>
          </div>
        </div>

        <!-- 高级配置 (折叠) -->
        <div class="space-y-4">
          <button @click="showAdvancedChat = !showAdvancedChat" class="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors py-1">
            <ChevronDown :class="['w-4 h-4 transition-transform duration-300', showAdvancedChat ? 'rotate-180' : '']" />
            {{ t('settings.rag.advancedConfig') }}
          </button>
          
          <div v-if="showAdvancedChat" class="space-y-8 p-6 rounded-2xl bg-muted/30 border border-dashed animate-in slide-in-from-top-2 duration-300">
            <!-- 1. 生成控制 (运行时参数) -->
            <div class="space-y-5">
              <div class="flex items-center gap-2 text-xs font-bold text-primary">
                <div class="w-1 h-3 bg-primary rounded-full"></div>
                {{ t('settings.rag.generationControl') }}
              </div>
              <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-6">
                <!-- Temperature -->
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <div class="flex flex-col">
                      <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.temperature') }}</Label>
                      <span class="text-[9px] text-muted-foreground/60 italic">{{ t('settings.rag.temperatureDesc') }}</span>
                    </div>
                    <span class="text-[10px] font-mono font-bold text-primary">{{ (settingStore.localChatTemp ?? 0.7).toFixed(1) }}</span>
                  </div>
                  <Slider :min="0" :max="2.0" :step="0.1" :model-value="[settingStore.localChatTemp]" @update:model-value="settingStore.setLocalChatTemp($event[0])" />
                </div>
                
                <!-- Top-P -->
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <div class="flex flex-col">
                      <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.topP') }}</Label>
                      <span class="text-[9px] text-muted-foreground/60 italic">{{ t('settings.rag.topPDesc') }}</span>
                    </div>
                    <span class="text-[10px] font-mono font-bold text-primary">{{ (settingStore.localChatTopP ?? 1.0).toFixed(2) }}</span>
                  </div>
                  <Slider :min="0" :max="1.0" :step="0.05" :model-value="[settingStore.localChatTopP]" @update:model-value="settingStore.setLocalChatTopP($event[0])" />
                </div>

                <!-- Max Tokens -->
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <div class="flex flex-col">
                      <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.maxTokens') }}</Label>
                    </div>
                    <span class="text-[10px] font-mono font-bold text-primary">{{ settingStore.localChatMaxTokens }}</span>
                  </div>
                  <Slider :min="16" :max="8192" :step="128" :model-value="[settingStore.localChatMaxTokens]" @update:model-value="settingStore.setLocalChatMaxTokens($event[0])" />
                </div>
              </div>

               <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-6">
                 <!-- Frequency Penalty -->
                 <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.frequencyPenalty') }}</Label>
                    <span class="text-[10px] font-mono font-bold text-primary">{{ (settingStore.localChatFreqPen ?? 0.0).toFixed(1) }}</span>
                  </div>
                  <Slider :min="-2.0" :max="2.0" :step="0.1" :model-value="[settingStore.localChatFreqPen]" @update:model-value="settingStore.setLocalChatFreqPen($event[0])" />
                </div>

                <!-- Presence Penalty -->
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.presencePenalty') }}</Label>
                    <span class="text-[10px] font-mono font-bold text-primary">{{ (settingStore.localChatPresPen ?? 0.0).toFixed(1) }}</span>
                  </div>
                  <Slider :min="-2.0" :max="2.0" :step="0.1" :model-value="[settingStore.localChatPresPen]" @update:model-value="settingStore.setLocalChatPresPen($event[0])" />
                </div>

                <div class="space-y-2">
                  <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.stopSequences') }}</Label>
                  <Input :model-value="settingStore.localChatStop" @update:model-value="settingStore.setLocalChatStop($event as string)" :placeholder="t('settings.rag.stopSequencesPlaceholder')" class="h-8 text-xs rounded-lg" />
                </div>
              </div>
            </div>

            <!-- 2. 性能与硬件 (启动参数，需重启生效) -->
            <div class="space-y-5 pt-4 border-t border-muted-foreground/10">
              <div class="flex items-center gap-2 text-xs font-bold text-primary">
                <div class="w-1 h-3 bg-amber-500 rounded-full"></div>
                {{ t('settings.rag.inferenceOptimization') }}
              </div>
              <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Context Size -->
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.contextWindow') }}</Label>
                    <span class="text-[10px] font-mono font-bold text-primary">{{ settingStore.localChatContextSize }}</span>
                  </div>
                  <Slider :min="512" :max="32768" :step="512" :model-value="[settingStore.localChatContextSize]" @update:model-value="settingStore.setLocalChatContextSize($event[0])" />
                </div>

                <!-- GPU Layers -->
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.gpuLayersNGL') }}</Label>
                    <span class="text-[10px] font-mono font-bold text-primary">{{ settingStore.localChatGpuLayers === -1 ? t('settings.rag.gpuLayersMax') : settingStore.localChatGpuLayers }}</span>
                  </div>
                  <Slider :min="-1" :max="100" :step="1" :model-value="[settingStore.localChatGpuLayers]" @update:model-value="settingStore.setLocalChatGpuLayers($event[0])" />
                </div>

                <!-- Threads -->
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.cpuThreads') }}</Label>
                    <span class="text-[10px] font-mono font-bold text-primary">{{ settingStore.localChatThreads }}</span>
                  </div>
                  <Slider :min="1" :max="32" :step="1" :model-value="[settingStore.localChatThreads]" @update:model-value="settingStore.setLocalChatThreads($event[0])" />
                </div>

                <!-- Batch Size -->
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.batchSize') }}</Label>
                    <span class="text-[10px] font-mono font-bold text-primary">{{ settingStore.localChatBatchSize }}</span>
                  </div>
                  <Slider :min="128" :max="2048" :step="128" :model-value="[settingStore.localChatBatchSize]" @update:model-value="settingStore.setLocalChatBatchSize($event[0])" />
                </div>
              </div>
              
              <div class="flex items-center gap-6">
                <div class="flex items-center gap-2">
                  <Checkbox id="chat-flash-attn" :checked="settingStore.localChatFlashAttn" @update:checked="settingStore.setLocalChatFlashAttn($event)" />
                  <Label for="chat-flash-attn" class="text-[10px] font-bold uppercase text-muted-foreground cursor-pointer">{{ t('settings.rag.flashAttention') }}</Label>
                </div>
                <div class="flex items-center gap-2">
                  <Label class="text-[10px] font-bold uppercase text-muted-foreground">{{ t('settings.rag.listenPort') }}</Label>
                  <Input type="number" :model-value="settingStore.localChatPort" @update:model-value="settingStore.setLocalChatPort(Number($event))" :disabled="chatState.isRunning" class="h-8 w-20 text-xs rounded-lg text-center" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useSettingStore } from '@/stores/setting'
import { useI18n } from '@/composables/useI18n'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/composables/useToast'
import { Switch } from '@/components/ui/switch'
import { Download, Play, Square, Bot, Loader2, Cpu, CheckCircle2, ChevronDown, MessageSquareText, Folder, Plus, Trash2 } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { logger } from '@/utils/logger'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'

const { t } = useI18n()
const settingStore = useSettingStore()
const { success, error, info } = useToast()

// Common state management for different purposes
interface ModelServiceState {
  isRunning: boolean
  isStarting: boolean
  isEngineExists: boolean
  isFileExists: boolean
  isDownloading: boolean
  downloadProgress: number
  downloadedBytes: number
  downloadTotal: number
}

const embeddingState = ref<ModelServiceState>({
  isRunning: false,
  isStarting: false,
  isEngineExists: false,
  isFileExists: false,
  isDownloading: false,
  downloadProgress: 0,
  downloadedBytes: 0,
  downloadTotal: 0
})

const chatState = ref<ModelServiceState>({
  isRunning: false,
  isStarting: false,
  isEngineExists: false,
  isFileExists: false,
  isDownloading: false,
  downloadProgress: 0,
  downloadedBytes: 0,
  downloadTotal: 0
})

const isEngineDownloading = ref(false)
const engineDownloadProgress = ref(0)
const engineDownloadedBytes = ref(0)
const engineDownloadTotal = ref(0)
const currentDownloadingEngineFile = ref('')
const detectedGpu = ref('')

const selectedEngineName = ref('Windows x64 (CUDA 12.4) [Default]')
const showAdvancedEmbedding = ref(false)
const showAdvancedChat = ref(false)

const engineOptions = [
  {
    name: 'Windows x64 (CPU - Default)',
    urls: ['https://github.com/ggml-org/llama.cpp/releases/download/b8833/llama-b8833-bin-win-cpu-x64.zip']
  },
  {
    name: 'Windows x64 (CUDA 12.4) [Default]',
    urls: [
      'https://github.com/ggml-org/llama.cpp/releases/download/b8833/llama-b8833-bin-win-cuda-12.4-x64.zip',
      'https://github.com/ggml-org/llama.cpp/releases/download/b8833/cudart-llama-bin-win-cuda-12.4-x64.zip'
    ]
  },
  {
    name: 'Windows x64 (CUDA 13.1)',
    urls: [
      'https://github.com/ggml-org/llama.cpp/releases/download/b8833/llama-b8833-bin-win-cuda-13.1-x64.zip',
      'https://github.com/ggml-org/llama.cpp/releases/download/b8833/cudart-llama-bin-win-cuda-13.1-x64.zip'
    ]
  },
  {
    name: 'Windows x64 (Vulkan)',
    urls: ['https://github.com/ggml-org/llama.cpp/releases/download/b8833/llama-b8833-bin-win-vulkan-x64.zip']
  },
  {
    name: 'Windows x64 (SYCL)',
    urls: ['https://github.com/ggml-org/llama.cpp/releases/download/b8833/llama-b8833-bin-win-sycl-x64.zip']
  },
  {
    name: 'Windows x64 (HIP Radeon)',
    urls: ['https://github.com/ggml-org/llama.cpp/releases/download/b8833/llama-b8833-bin-win-hip-radeon-x64.zip']
  },
  {
    name: 'Windows ARM64',
    urls: ['https://github.com/ggml-org/llama.cpp/releases/download/b8833/llama-b8833-bin-win-cpu-arm64.zip']
  }
]

const presetEmbeddingModels = [
  {
    name: 'Qwen3-Embedding-0.6B (首选推荐)',
    filename: 'qwen3-embedding-0.6b-q8_0.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf'
  },
  {
    name: 'bce-embedding-base_v1 (备选)',
    filename: 'bce-embedding-base_v1-q8_0.gguf',
    url: 'https://huggingface.co/netease-youdao/bce-embedding-base_v1-GGUF/resolve/main/bce-embedding-base_v1-q8_0.gguf'
  }
]

const presetChatModels = [
  {
    name: 'Gemma-4-E2B-it (2.3B - 轻量首选)',
    filename: 'gemma-4-e2b-it-q4_k_m.gguf',
    url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf',
    desc: '适合低配电脑，显存占用约 1.6GB'
  },
  {
    name: 'Gemma-4-E4B-it (4.5B - 推荐平衡)',
    filename: 'gemma-4-e4b-it-q4_k_m.gguf',
    url: 'https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf',
    desc: '性能出色，显存占用约 3.2GB'
  }
]

interface ModelDownloadPayload {
  filename: string
  downloaded: number
  total: number
}

let unlistenProgress: (() => void) | null = null
let unlistenEngineProgress: (() => void) | null = null
let statusInterval: any = null

onMounted(async () => {
  await probeGpuAndRecommend()
  
  // Initial checks
  await checkAllStatus()

  // Polling for status
  statusInterval = setInterval(checkAllStatus, 3000)

  // Listen for model download progress
  unlistenProgress = await listen<ModelDownloadPayload>('model-download-progress', (event) => {
    const payload = event.payload
    if (payload.filename === settingStore.localEmbeddingModelStr) {
       updateDownloadState(embeddingState.value, payload)
    }
    if (payload.filename === settingStore.localChatModelStr) {
       updateDownloadState(chatState.value, payload)
    }
  })

  // Listen for engine download progress
  unlistenEngineProgress = await listen<ModelDownloadPayload>('engine-download-progress', (event) => {
    const payload = event.payload
    currentDownloadingEngineFile.value = payload.filename
    engineDownloadedBytes.value = payload.downloaded
    engineDownloadTotal.value = payload.total || 1
    engineDownloadProgress.value = (engineDownloadedBytes.value / engineDownloadTotal.value) * 100
  })
})

const updateDownloadState = (state: ModelServiceState, payload: ModelDownloadPayload) => {
  state.downloadedBytes = payload.downloaded
  state.downloadTotal = payload.total || 1
  state.downloadProgress = (state.downloadedBytes / state.downloadTotal) * 100
  
  if (payload.downloaded >= payload.total) {
    state.isDownloading = false
    state.isFileExists = true
    state.downloadProgress = 100
    success(t('settings.rag.downloadCompleteWithFilename', { filename: payload.filename }))
  }
}

onUnmounted(() => {
  unlistenProgress?.()
  unlistenEngineProgress?.()
  if (statusInterval) clearInterval(statusInterval)
})

const checkAllStatus = async () => {
  await Promise.all([
    checkServiceStatus('embedding', embeddingState.value),
    checkServiceStatus('chat', chatState.value),
    checkEngineExists(),
    checkFileExists('embedding', settingStore.localEmbeddingModelStr, embeddingState.value),
    checkFileExists('chat', settingStore.localChatModelStr, chatState.value)
  ])
}

const checkServiceStatus = async (purpose: string, state: ModelServiceState) => {
  try {
    state.isRunning = await invoke<boolean>('check_llama_server_status', { purpose })
    if (purpose === 'chat') {
      settingStore.setLocalChatRunning(state.isRunning)
    } else {
      settingStore.setLocalEmbeddingRunning(state.isRunning)
    }
  } catch {
    state.isRunning = false
    if (purpose === 'chat') {
      settingStore.setLocalChatRunning(false)
    } else {
      settingStore.setLocalEmbeddingRunning(false)
    }
  }
}

const checkEngineExists = async () => {
  try {
    const exists = await invoke<boolean>('check_llama_engine_exists')
    embeddingState.value.isEngineExists = exists
    chatState.value.isEngineExists = exists
  } catch {}
}

const checkFileExists = async (purpose: string, filename: string, state: ModelServiceState) => {
  if (!filename) return
  try {
    state.isFileExists = await invoke<boolean>('check_model_exists', { filename })
  } catch {}
}

const probeGpuAndRecommend = async () => {
  try {
    const gpus = await invoke<string[]>('get_system_gpu_info')
    if (gpus && gpus.length > 0) {
      let primary = gpus.find(g => g.toUpperCase().includes('NVIDIA'))
      if (!primary) primary = gpus.find(g => g.toUpperCase().includes('AMD') || g.toUpperCase().includes('RADEON'))
      if (!primary) primary = gpus[0]
      detectedGpu.value = primary
      const upper = primary.toUpperCase()
      if (upper.includes('NVIDIA')) {
        selectedEngineName.value = 'Windows x64 (CUDA 12.4) [Default]'
      } else if (upper.includes('AMD') || upper.includes('RADEON')) {
        selectedEngineName.value = 'Windows x64 (Vulkan)'
      } else {
        selectedEngineName.value = 'Windows x64 (CPU - Default)'
      }
    }
  } catch (e) {
    logger.ai.error('Failed to probe GPU info', e)
  }
}

const downloadEngine = async () => {
  const targetEngine = engineOptions.find(e => e.name === selectedEngineName.value)
  if (!targetEngine) return

  isEngineDownloading.value = true
  engineDownloadProgress.value = 0
  engineDownloadedBytes.value = 0
  currentDownloadingEngineFile.value = t('settings.rag.aboutToStart')
  
  try {
    info(t('settings.rag.engineDownloadStartToast'))
    await invoke<string>('download_and_extract_llama_cpp', { urls: targetEngine.urls })
    success(t('settings.rag.engineDownloadSuccessToast'))
    await checkEngineExists()
  } catch (e: any) {
    error(`${e}`, t('settings.rag.configFailed'))
  } finally {
    isEngineDownloading.value = false
  }
}

const downloadModel = async (purpose: 'embedding' | 'chat') => {
  const state = purpose === 'embedding' ? embeddingState.value : chatState.value
  const filename = purpose === 'embedding' ? settingStore.localEmbeddingModelStr : settingStore.localChatModelStr
  
  let url = ''
  if (purpose === 'embedding') {
    url = presetEmbeddingModels.find(m => m.filename === filename)?.url || ''
  } else {
    url = presetChatModels.find(m => m.filename === filename)?.url || ''
  }

  if (!url || !filename) {
    error(t('settings.rag.missingUrlOrFilename'))
    return
  }

  state.isDownloading = true
  state.downloadProgress = 0
  state.downloadedBytes = 0
  
  try {
    info(t('settings.rag.startDownloadModel'))
    await invoke<string>('download_local_model', { url, filename })
  } catch (e: any) {
    error(t('settings.rag.downloadFailed', { error: e }))
    state.isDownloading = false
  }
}

const startServer = async (purpose: 'embedding' | 'chat') => {
  const state = purpose === 'embedding' ? embeddingState.value : chatState.value
  state.isStarting = true
  
  try {
    const port = purpose === 'embedding' ? settingStore.localEmbeddingPort : settingStore.localChatPort
    const modelFilename = purpose === 'embedding' ? settingStore.localEmbeddingModelStr : settingStore.localChatModelStr
    const contextSize = purpose === 'chat' ? settingStore.localChatContextSize : undefined

    const unlistenReady = await listen(`llama-server-ready-${purpose}`, () => {
      state.isRunning = true
      state.isStarting = false
      if (purpose === 'chat') {
        settingStore.setLocalChatRunning(true)
      } else {
        settingStore.setLocalEmbeddingRunning(true)
      }
      success(t('settings.rag.serverStarted'))
      unlistenReady()
    })
    
    const unlistenError = await listen(`llama-server-error-${purpose}`, (event: any) => {
       state.isStarting = false
       error(t('local.toast.engineLoadError', { error: event.payload }))
       unlistenError()
    })

    await invoke<string>('start_llama_server', {
       modelFilename,
       port: Number(port),
       purpose,
       contextSize: purpose === 'chat' ? settingStore.localChatContextSize : settingStore.localEmbeddingMaxSeq,
       gpuLayers: purpose === 'chat' ? settingStore.localChatGpuLayers : settingStore.localEmbeddingGpuLayers,
       threads: purpose === 'chat' ? settingStore.localChatThreads : settingStore.localEmbeddingThreads,
       batchSize: purpose === 'chat' ? settingStore.localChatBatchSize : settingStore.localEmbeddingBatchSize,
       flashAttn: purpose === 'chat' ? settingStore.localChatFlashAttn : true,
    })
  } catch(e: any) {
    error(t('local.toast.startFailed', { error: e }))
    state.isStarting = false
  }
}

const selectModelFile = async (purpose: 'embedding' | 'chat') => {
  try {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'GGUF Model',
        extensions: ['gguf']
      }]
    })
    
    if (selected && typeof selected === 'string') {
      if (purpose === 'embedding') {
        settingStore.setLocalEmbeddingModelStr(selected)
      } else {
        settingStore.setLocalChatModelStr(selected)
      }
      success(t('settings.rag.modelFileSelected'))
    }
  } catch (e) {
    logger.ai.error('Picker error', e)
  }
}

const stopServer = async (purpose: 'embedding' | 'chat') => {
  const state = purpose === 'embedding' ? embeddingState.value : chatState.value
  try {
    await invoke<string>('stop_llama_server', { purpose })
    state.isRunning = false
    if (purpose === 'chat') {
      settingStore.setLocalChatRunning(false)
    } else {
      settingStore.setLocalEmbeddingRunning(false)
    }
    info(t('settings.rag.serverStopped'))
  } catch(e) {
    logger.ai.error('Stop err', e)
  }
}

const onPresetModelSelect = (filename: string, purpose: 'embedding' | 'chat') => {
  if (purpose === 'embedding') {
    settingStore.setLocalEmbeddingModelStr(filename)
  } else {
    settingStore.setLocalChatModelStr(filename)
  }
}
</script>
