'use client';

import { FolderPlus, Clock } from 'lucide-react';

export function ActionButtons() {
    return (
        <div className="fixed top-16 left-0 md:left-[240px] right-0 h-12 bg-white flex items-center justify-end px-4 gap-2 border-b border-[#e8eaed] z-40 w-full md:w-[calc(100%-240px)]">
            <button className="flex items-center gap-2 px-4 py-1.5 bg-[#f1f3f4] hover:bg-[#e8eaed] text-[#3c4043] rounded-lg text-sm font-medium transition-colors">
                <FolderPlus className="w-4 h-4" />
                <span>Create album</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-1.5 bg-[#f1f3f4] hover:bg-[#e8eaed] text-[#3c4043] rounded-lg text-sm font-medium transition-colors">
                <Clock className="w-4 h-4" />
                <span>Latest photos</span>
            </button>
        </div>
    );
}
