import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAuth } from '../../hooks/useAuth.ts';
import { useThemeStore } from '../../stores/themeStore';
import { Search, Moon, Sun, LogOut } from 'lucide-react';
import ConversationList from './ConversationList.tsx';
import SearchOverlay from './SearchOverlay.tsx';
import ProfileOverlay from './ProfileOverlay.tsx';

export default function ChatSidebar() {
  const { user } = useAuthStore();
  const { signOut } = useAuth();
  const { isDark, toggleTheme } = useThemeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isProfileActive, setIsProfileActive] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Click ra ngoài để tắt overlay
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchActive(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative flex flex-col h-full bg-white dark:bg-[#1E1E1E] transition-colors duration-200" ref={searchContainerRef}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsProfileActive(true);
              setIsSearchActive(false);
              setSearchQuery('');
            }}
            className="rounded-full"
            aria-label="Mở profile người dùng"
          >
            {user?.urlAvatar ? (
              <img src={user.urlAvatar} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-cyan-400 rounded-full flex items-center justify-center text-white font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
          </button>
          <h2 className="font-bold text-xl text-gray-900 dark:text-white">Chats</h2>
        </div>

        <div className="flex gap-2 text-gray-500 dark:text-gray-400">
          <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={signOut} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 rounded-full transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Search Input Area */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search messages or users"
            className="w-full bg-gray-100 dark:bg-[#2C2C2C] text-gray-900 dark:text-gray-100 placeholder-gray-500 py-2.5 pl-10 pr-4 rounded-full focus:outline-none focus:ring-2 focus:ring-[#8ED8ED] transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              setIsProfileActive(false);
              setIsSearchActive(true);
            }}
          />
        </div>
      </div>

      {/* Container cho Danh sách hoặc Overlay */}
      <div className="flex-1 relative overflow-hidden">
        <div className="h-full overflow-y-auto">
          <ConversationList />
        </div>

        {isProfileActive && (
          <div className="absolute inset-0 z-10 bg-white dark:bg-[#1E1E1E]">
            <ProfileOverlay onClose={() => setIsProfileActive(false)} />
          </div>
        )}

        {/* Overlay chỉ phủ kín phần flex-1 này (vùng chứa danh sách) */}
        {isSearchActive && !isProfileActive && (
          <div className="absolute inset-0 z-10 bg-white dark:bg-[#1E1E1E]">
            <SearchOverlay query={searchQuery} onClose={() => { setIsSearchActive(false); setSearchQuery('') }} />
          </div>
        )}
      </div>
    </div>
  );
}
