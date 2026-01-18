'use client';

import { Search, Plus, HelpCircle, Settings, Grid3x3, User, Menu } from 'lucide-react';
import { useState } from 'react';
import { useSidebar } from '@/contexts/sidebar-context';

export function TopBar() {
    const [searchFocused, setSearchFocused] = useState(false);
    const { toggle } = useSidebar();

    return (
        <div className="fixed top-0 left-0 md:left-[240px] right-0 z-40 w-full md:w-[calc(100%-240px)]">
            <header className="h-16 bg-[#202124] flex items-center justify-between px-4 w-full">
                {/* Left: Hamburger Menu */}
                <button
                    onClick={toggle}
                    className="md:hidden p-1.5 text-white hover:bg-[#303134] rounded-lg transition-colors flex-shrink-0"
                    aria-label="Toggle sidebar"
                >
                    <Menu className="w-4 h-4" />
                </button>

                {/* Center: Search Bar */}
                <div className="flex-1 flex justify-center max-w-2xl mx-auto min-w-0">
                    <div className={`relative w-full max-w-2xl transition-all ${searchFocused ? 'shadow-lg' : ''}`}>
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className={`h-5 w-5 transition-colors ${searchFocused ? 'text-[#1a73e8]' : 'text-[#9aa0a6]'}`} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search your photos"
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setSearchFocused(false)}
                            className="block w-full pl-12 pr-4 py-2.5 border-none rounded-full bg-[#303134] text-white placeholder-[#9aa0a6] focus:outline-none focus:ring-0 focus:bg-[#303134] focus:shadow-lg transition-all text-sm"
                        />
                    </div>
                </div>

                {/* Right: Icons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button className="p-2 text-white hover:bg-[#303134] rounded-full transition-colors">
                        <Plus className="w-5 h-5" />
                    </button>
                    <button className="p-2 text-white hover:bg-[#303134] rounded-full transition-colors">
                        <HelpCircle className="w-5 h-5" />
                    </button>
                    <button className="p-2 text-white hover:bg-[#303134] rounded-full transition-colors">
                        <Settings className="w-5 h-5" />
                    </button>
                    <button className="p-2 text-white hover:bg-[#303134] rounded-full transition-colors">
                        <Grid3x3 className="w-5 h-5" />
                    </button>
                    <button className="p-1.5 ml-1 rounded-full hover:bg-[#303134] transition-colors">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4285f4] to-[#34a853] flex items-center justify-center text-white">
                            <User className="w-4 h-4" />
                        </div>
                    </button>
                </div>
            </header>
        </div>
    );
}
