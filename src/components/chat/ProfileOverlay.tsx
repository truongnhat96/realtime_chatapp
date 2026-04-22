import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Camera, Loader2, SquarePen } from 'lucide-react';
import { chatApi } from '../../lib/api';
import type { User } from '../../types/chat';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';

interface ProfileOverlayProps {
  onClose: () => void;
}

const KB = 1024;
const AVATAR_TARGET_MIN_BYTES = 100 * KB;
const AVATAR_TARGET_MAX_BYTES = 150 * KB;
const AVATAR_MAX_DIMENSION = 1080;
const AVATAR_MIN_DIMENSION = 280;

const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Không thể đọc file ảnh.'));
    };

    img.src = objectUrl;
  });
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Không thể nén ảnh.'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      quality,
    );
  });
};

const optimizeAvatarFile = async (file: File): Promise<File> => {
  if (file.size <= AVATAR_TARGET_MAX_BYTES) {
    return file;
  }

  const img = await loadImageFromFile(file);
  const sourceWidth = img.naturalWidth;
  const sourceHeight = img.naturalHeight;
  const largestSide = Math.max(sourceWidth, sourceHeight);
  const baseScale = largestSide > AVATAR_MAX_DIMENSION ? AVATAR_MAX_DIMENSION / largestSide : 1;

  let scale = baseScale;
  let quality = 0.88;
  let bestBlob: Blob | null = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const width = Math.max(Math.round(sourceWidth * scale), AVATAR_MIN_DIMENSION);
    const height = Math.max(Math.round(sourceHeight * scale), AVATAR_MIN_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Không thể xử lý ảnh trên trình duyệt này.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, quality);
    bestBlob = blob;

    if (blob.size <= AVATAR_TARGET_MAX_BYTES && blob.size >= AVATAR_TARGET_MIN_BYTES) {
      break;
    }

    if (blob.size <= AVATAR_TARGET_MAX_BYTES) {
      break;
    }

    if (quality > 0.62) {
      quality -= 0.08;
      continue;
    }

    const canReduceDimension = Math.min(width, height) > AVATAR_MIN_DIMENSION;
    if (!canReduceDimension) {
      break;
    }

    scale *= 0.88;
    quality = Math.min(quality + 0.04, 0.8);
  }

  if (!bestBlob) {
    throw new Error('Không thể tối ưu ảnh đại diện.');
  }

  const outputName = `${file.name.replace(/\.[^/.]+$/, '') || 'avatar'}.webp`;
  return new File([bestBlob], outputName, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
};

export default function ProfileOverlay({ onClose }: ProfileOverlayProps) {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAuth = useAuthStore((state) => state.setAuth);

  const addToast = useToastStore((state) => state.addToast);

  const [profile, setProfile] = useState<User | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchProfile = async () => {
      if (!user?.id) {
        setIsLoadingProfile(false);
        return;
      }

      setIsLoadingProfile(true);
      try {
        const res = await chatApi.getUserProfile(user.id);
        if (!isMounted) return;
        setProfile(res.data);
      } catch (error) {
        if (!isMounted) return;
        const errorMessage = error instanceof Error ? error.message : 'Không thể tải thông tin profile';
        addToast({
          type: 'error',
          message: errorMessage,
        });
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [addToast, user?.id]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const displayAvatar = useMemo(() => {
    return previewUrl || profile?.urlAvatar || '';
  }, [previewUrl, profile?.urlAvatar]);

  const avatarInitial = useMemo(() => {
    return (profile?.name || 'U').charAt(0).toUpperCase();
  }, [profile?.name]);

  const handlePickAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleSelectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addToast({
        type: 'error',
        message: 'Chỉ chấp nhận file ảnh.',
      });
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
  };

  const handleSave = async () => {
    if (!selectedFile || !user || !accessToken) return;

    setIsSaving(true);
    try {
      const optimizedFile = await optimizeAvatarFile(selectedFile);
      const res = await chatApi.uploadAvatar(optimizedFile);
      const uploadedUrl = res.data?.url;

      if (!uploadedUrl) {
        throw new Error('Không nhận được URL ảnh sau khi upload.');
      }

      setProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          urlAvatar: uploadedUrl,
        };
      });

      setAuth({
        ...user,
        urlAvatar: uploadedUrl,
      },
        accessToken,
        useAuthStore.getState().sessionId || ''
      );

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setSelectedFile(null);

      addToast({
        type: 'success',
        message: 'Cập nhật ảnh đại diện thành công.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Cập nhật ảnh đại diện thất bại';
      addToast({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 pb-6 pt-3">
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-[#2C2C2C] dark:hover:text-white"
          aria-label="Quay lại danh sách chat"
        >
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">Profile</h3>
      </div>

      {isLoadingProfile ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <Loader2 className="animate-spin text-[#8ED8ED]" size={26} />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex justify-center pt-2">
            <div className="relative">
              {displayAvatar ? (
                <img src={displayAvatar} alt="Avatar" className="h-24 w-24 rounded-full object-cover" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 text-4xl font-bold text-[#2D72D9] dark:bg-[#2C2C2C] dark:text-[#8ED8ED]">
                  {avatarInitial}
                </div>
              )}

              <button
                type="button"
                onClick={handlePickAvatar}
                className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-800 shadow-md transition-colors hover:bg-gray-100 dark:bg-[#2C2C2C] dark:text-gray-100 dark:hover:bg-[#3A3A3A]"
                aria-label="Chọn ảnh đại diện"
              >
                <Camera size={14} />
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleSelectFile}
            className="hidden"
          />

          <div className="space-y-4 pt-1">
            <div>
              <div className="mb-1 flex items-center gap-3">
                <span className="text-[28px] leading-none text-gray-300 dark:text-gray-600">|</span>
                <label className="text-[26px] font-medium text-gray-900 dark:text-white">Tên hiển thị</label>
              </div>
              <input
                readOnly
                value={profile?.name || ''}
                placeholder="Enter Name Here"
                className="h-12 w-full rounded-2xl border border-gray-300 bg-transparent px-5 text-base text-gray-600 placeholder:text-gray-400 focus:outline-none dark:border-gray-600 dark:text-gray-300"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center gap-3">
                <span className="text-[28px] leading-none text-gray-300 dark:text-gray-600">|</span>
                <label className="text-[26px] font-medium text-gray-900 dark:text-white">Số điện thoại</label>
              </div>
              <input
                readOnly
                value={profile?.phoneNumber || ''}
                placeholder="Enter Contact No. Here"
                className="h-12 w-full rounded-2xl border border-gray-300 bg-transparent px-5 text-base text-gray-600 placeholder:text-gray-400 focus:outline-none dark:border-gray-600 dark:text-gray-300"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center gap-3">
                <span className="text-[28px] leading-none text-gray-300 dark:text-gray-600">|</span>
                <label className="text-[26px] font-medium text-gray-900 dark:text-white">Email</label>
              </div>
              <div className="relative">
                <input
                  readOnly
                  value={profile?.email || ''}
                  placeholder="Enter Email Here"
                  className="h-12 w-full rounded-2xl border border-gray-300 bg-transparent px-5 pr-12 text-base text-gray-600 placeholder:text-gray-400 focus:outline-none dark:border-gray-600 dark:text-gray-300"
                />
                <SquarePen size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center gap-3">
                <span className="text-[28px] leading-none text-gray-300 dark:text-gray-600">|</span>
                <label className="text-[26px] font-medium text-gray-900 dark:text-white">Tên người dùng</label>
              </div>
              <input
                readOnly
                value={profile?.userName || ''}
                placeholder="Enter Username Here"
                className="h-12 w-full rounded-2xl border border-gray-300 bg-transparent px-5 text-base text-gray-600 placeholder:text-gray-400 focus:outline-none dark:border-gray-600 dark:text-gray-300"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedFile || isSaving}
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-xl bg-black text-base font-semibold text-white transition-colors hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-black/40"
          >
            {isSaving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={18} />
                Lưu thay đổi...
              </span>
            ) : (
              'Lưu thông tin'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
