import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { chatApi } from '../lib/api';
import type { Attachment } from '../types/chat';

/** Detect messageType từ MIME: 1=Image, 2=Video, 3=File */
const detectMessageType = (file: File): number => {
  if (file.type.startsWith('image/')) return 1;
  if (file.type.startsWith('video/')) return 2;
  return 3;
};

interface UseMediaUploadParams {
  conversationId: string;
  stopTyping: () => void;
}

/**
 * Hook xử lý upload nhiều file đồng thời.
 * - Ảnh: upload song song (Promise.all) → 1 lần send-media
 * - Video/File: upload tuần tự (queue) → send-media mỗi file
 */
export function useMediaUpload({ conversationId, stopTyping }: UseMediaUploadParams) {
  const handleSendMediaFiles = useCallback(async (files: File[], replyToMessageId?: string) => {
    const currentUserId = useAuthStore.getState().user?.id;
    if (!currentUserId || files.length === 0) return;

    const sendTime = new Date().toISOString();
    const batchId = crypto.randomUUID();
    let batchOrderCounter = 0;

    // Phân loại file
    const images: File[] = [];
    const videos: File[] = [];
    const documents: File[] = [];

    for (const file of files) {
      const type = detectMessageType(file);
      if (type === 1) images.push(file);
      else if (type === 2) videos.push(file);
      else documents.push(file);
    }

    // === Khởi tạo Temp Messages cho tất cả ===
    const store = useChatStore.getState();
    const imageBatchId = crypto.randomUUID();
    const queue = [...videos, ...documents];

    // 1. Tạo temp message cho ảnh
    let tempImageAttachments: Attachment[] = [];
    let imageBatchOrder = 0;
    if (images.length > 0) {
      imageBatchOrder = batchOrderCounter++;
      tempImageAttachments = images.map(file => ({
        fileName: file.name, fileSize: file.size, url: '', localObjectUrl: URL.createObjectURL(file),
      }));
      store.addMessage(conversationId, {
        id: imageBatchId, content: '', sendTime, fromUserId: currentUserId, messageType: 1,
        isLoading: true, progress: 0, attachments: tempImageAttachments,
        batchId, batchOrder: imageBatchOrder,
        replyToMessageId: replyToMessageId || undefined,
      });
      const previewText = images.length === 1 ? '[Hình ảnh]' : `[${images.length} Hình ảnh]`;
      store.updateConversationLastMessage(conversationId, previewText, sendTime, currentUserId, 1, useAuthStore.getState().user?.name);
    }

    // 1.5. Tạo danh sách chờ cho video/file (Đảm bảo batchOrder được gán SAU ảnh)
    const queueItems = queue.map(file => ({
      file,
      tempId: crypto.randomUUID(),
      messageType: detectMessageType(file),
      batchOrder: batchOrderCounter++
    }));

    // 2. Tạo temp message cho video/tệp
    for (const item of queueItems) {
      const localObjectUrl = URL.createObjectURL(item.file);
      store.addMessage(conversationId, {
        id: item.tempId, content: '', sendTime, fromUserId: currentUserId, messageType: item.messageType,
        fileName: item.file.name, fileSize: item.file.size, isLoading: true, progress: 0, localObjectUrl,
        attachments: [{ fileName: item.file.name, fileSize: item.file.size, url: '', localObjectUrl }],
        batchId, batchOrder: item.batchOrder,
        replyToMessageId: replyToMessageId || undefined,
      });
      const previewText = item.messageType === 2 ? '[Video]' : `[File] ${item.file.name}`;
      store.updateConversationLastMessage(conversationId, previewText, sendTime, currentUserId, item.messageType, useAuthStore.getState().user?.name);
    }

    stopTyping();

    // === Tiến hành Upload ===
    if (images.length > 0) {
      processImageBatch(images, conversationId, currentUserId, sendTime, imageBatchId, tempImageAttachments, batchId, imageBatchOrder, replyToMessageId).catch(console.error);
    }

    if (queueItems.length > 0) {
      processQueue(queueItems, conversationId, currentUserId, sendTime, batchId, replyToMessageId).catch(console.error);
    }
  }, [conversationId, stopTyping]);

  return { handleSendMediaFiles };
}

/**
 * Upload song song tất cả ảnh → 1 lần send-media
 */
async function processImageBatch(
  images: File[],
  conversationId: string,
  currentUserId: string,
  sendTime: string,
  tempId: string,
  tempAttachments: Attachment[],
  batchId: string,
  batchOrder: number,
  replyToMessageId?: string
) {
  try {
    // Upload song song, theo dõi progress trung bình
    const progressMap = new Map<number, number>();

    const uploadPromises = images.map((file, index) =>
      chatApi.uploadMedia(
        conversationId,
        1, // Image
        file,
        sendTime,
        (progress) => {
          progressMap.set(index, progress);
          // Tính trung bình progress
          let total = 0;
          for (const v of progressMap.values()) total += v;
          const avg = Math.round(total / images.length);
          useChatStore.getState().updateMessageProgress(conversationId, tempId, avg);
        }
      )
    );

    const uploadResults = await Promise.all(uploadPromises);

    // Gom kết quả thành mảng attachments
    const serverAttachments: Attachment[] = uploadResults.map(r => ({
      fileName: r.fileName,
      fileSize: r.fileSize,
      url: r.url,
    }));

    // Gọi send-media 1 lần với tất cả ảnh
    const sendResult = await chatApi.sendMedia(
      conversationId,
      1, // Image
      currentUserId,
      sendTime,
      serverAttachments,
      batchId,
      batchOrder,
      replyToMessageId
    );

    // Finalize: thay temp message bằng message thật
    useChatStore.getState().finalizeMediaMessage(
      conversationId,
      tempId,
      sendResult.messageId || sendResult.mediaMessageId || '',
      serverAttachments[0]?.url || '',
      serverAttachments
    );

    // Cleanup localObjectUrls
    for (const att of tempAttachments) {
      if (att.localObjectUrl) URL.revokeObjectURL(att.localObjectUrl);
    }
  } catch (error) {
    console.error('Failed to send image batch:', error);
    useChatStore.getState().updateMessageError(
      conversationId, tempId, 'Gửi ảnh thất bại. Vui lòng thử lại.'
    );
  }
}

async function processQueue(
  items: Array<{ file: File; tempId: string; messageType: number; batchOrder: number }>,
  conversationId: string,
  currentUserId: string,
  sendTime: string,
  batchId: string,
  replyToMessageId?: string
) {
  for (const item of items) {
    await processSingleFile(item.file, item.tempId, item.messageType, conversationId, currentUserId, sendTime, batchId, item.batchOrder, replyToMessageId);
  }
}

async function processSingleFile(
  file: File,
  tempId: string,
  messageType: number,
  conversationId: string,
  currentUserId: string,
  sendTime: string,
  batchId: string,
  batchOrder: number,
  replyToMessageId?: string
) {
  try {
    // Upload file
    const uploadResult = await chatApi.uploadMedia(
      conversationId,
      messageType,
      file,
      sendTime,
      (progress) => {
        useChatStore.getState().updateMessageProgress(conversationId, tempId, progress);
      }
    );

    // Gọi send-media
    const serverAttachments: Attachment[] = [{
      fileName: uploadResult.fileName,
      fileSize: uploadResult.fileSize,
      url: uploadResult.url,
    }];

    const sendResult = await chatApi.sendMedia(
      conversationId,
      messageType,
      currentUserId,
      sendTime,
      serverAttachments,
      batchId,
      batchOrder,
      replyToMessageId
    );

    // Finalize
    useChatStore.getState().finalizeMediaMessage(
      conversationId,
      tempId,
      sendResult.messageId || sendResult.mediaMessageId || '',
      uploadResult.url,
      serverAttachments
    );

    // Get the object url from the store message and revoke it
    const storeMsg = useChatStore.getState().messages[conversationId]?.find(m => m.id === tempId);
    if (storeMsg?.localObjectUrl) {
      URL.revokeObjectURL(storeMsg.localObjectUrl);
    }
  } catch (error) {
    console.error('Failed to send file:', error);
    useChatStore.getState().updateMessageError(
      conversationId, tempId, 'Gửi thất bại. Vui lòng thử lại.'
    );
  }
}
