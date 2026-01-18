'use client';

import Image from 'next/image';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

// Mock Albums Data
const ALBUMS = [
    {
        id: 1,
        title: 'Apple',
        count: 274,
        thumbnail: 'https://picsum.photos/id/10/400/300',
        thumbnails: [
            'https://picsum.photos/id/10/200/200',
            'https://picsum.photos/id/11/200/200',
            'https://picsum.photos/id/12/200/200',
            'https://picsum.photos/id/13/200/200',
        ]
    },
    {
        id: 2,
        title: 'Orange',
        count: 57,
        thumbnail: 'https://picsum.photos/id/20/400/300',
        thumbnails: [
            'https://picsum.photos/id/20/200/200',
            'https://picsum.photos/id/21/200/200',
        ]
    },
    {
        id: 3,
        title: 'Banana',
        count: 350,
        thumbnail: 'https://picsum.photos/id/30/400/300',
        thumbnails: [
            'https://picsum.photos/id/30/200/200',
            'https://picsum.photos/id/31/200/200',
            'https://picsum.photos/id/32/200/200',
            'https://picsum.photos/id/33/200/200',
        ]
    },
    {
        id: 4,
        title: 'Strawberry',
        count: 1,
        thumbnail: 'https://picsum.photos/id/40/400/300',
        thumbnails: [
            'https://picsum.photos/id/40/200/200',
        ]
    },
    {
        id: 5,
        title: 'Grape',
        count: 91,
        thumbnail: 'https://picsum.photos/id/50/400/300',
        thumbnails: [
            'https://picsum.photos/id/50/200/200',
            'https://picsum.photos/id/51/200/200',
        ]
    },
    {
        id: 6,
        title: 'Watermelon',
        count: 500,
        thumbnail: 'https://picsum.photos/id/60/400/300',
        thumbnails: [
            'https://picsum.photos/id/60/200/200',
            'https://picsum.photos/id/61/200/200',
            'https://picsum.photos/id/62/200/200',
            'https://picsum.photos/id/63/200/200',
        ]
    },
    {
        id: 7,
        title: 'Pineapple',
        count: 51,
        thumbnail: 'https://picsum.photos/id/70/400/300',
        thumbnails: [
            'https://picsum.photos/id/70/200/200',
            'https://picsum.photos/id/71/200/200',
        ]
    },
    {
        id: 8,
        title: 'Mango',
        count: 123,
        thumbnail: 'https://picsum.photos/id/80/400/300',
        thumbnails: [
            'https://picsum.photos/id/80/200/200',
            'https://picsum.photos/id/81/200/200',
            'https://picsum.photos/id/82/200/200',
            'https://picsum.photos/id/83/200/200',
        ]
    },
    {
        id: 9,
        title: 'Kiwi',
        count: 221,
        thumbnail: 'https://picsum.photos/id/90/400/300',
        thumbnails: [
            'https://picsum.photos/id/90/200/200',
            'https://picsum.photos/id/91/200/200',
            'https://picsum.photos/id/92/200/200',
            'https://picsum.photos/id/93/200/200',
        ]
    },
    {
        id: 10,
        title: 'Peach',
        count: 142,
        thumbnail: 'https://picsum.photos/id/100/400/300',
        thumbnails: [
            'https://picsum.photos/id/100/200/200',
            'https://picsum.photos/id/101/200/200',
        ]
    },
    {
        id: 11,
        title: 'Cherry',
        count: 227,
        thumbnail: 'https://picsum.photos/id/110/400/300',
        thumbnails: [
            'https://picsum.photos/id/110/200/200',
            'https://picsum.photos/id/111/200/200',
            'https://picsum.photos/id/112/200/200',
        ]
    },
    {
        id: 12,
        title: 'Lemon',
        count: 178,
        thumbnail: 'https://picsum.photos/id/120/400/300',
        thumbnails: [
            'https://picsum.photos/id/120/200/200',
            'https://picsum.photos/id/121/200/200',
            'https://picsum.photos/id/122/200/200',
            'https://picsum.photos/id/123/200/200',
        ]
    },
];

type FilterType = 'all' | 'my' | 'shared';

export function AlbumsGrid() {
    const [selectedAlbums, setSelectedAlbums] = useState<Set<number>>(new Set());
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    const toggleSelection = (id: number) => {
        const newSelected = new Set(selectedAlbums);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedAlbums(newSelected);
    };

    return (
        <div className="pb-20">
            {/* Title and Filters */}
            <div className="mb-6">
                <h1 className="text-3xl font-normal text-[#202124] mb-4">Albums</h1>
                
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveFilter('all')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeFilter === 'all'
                                ? 'bg-[#1a73e8] text-white'
                                : 'bg-[#f1f3f4] text-[#3c4043] hover:bg-[#e8eaed]'
                        }`}
                    >
                        {activeFilter === 'all' && <CheckCircle2 className="w-4 h-4" />}
                        All
                    </button>
                    <button
                        onClick={() => setActiveFilter('my')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeFilter === 'my'
                                ? 'bg-[#1a73e8] text-white'
                                : 'bg-[#f1f3f4] text-[#3c4043] hover:bg-[#e8eaed]'
                        }`}
                    >
                        My albums
                    </button>
                    <button
                        onClick={() => setActiveFilter('shared')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeFilter === 'shared'
                                ? 'bg-[#1a73e8] text-white'
                                : 'bg-[#f1f3f4] text-[#3c4043] hover:bg-[#e8eaed]'
                        }`}
                    >
                        Shared with me
                    </button>
                    <button className="p-2 text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg transition-colors ml-auto">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Albums Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {ALBUMS.map((album) => {
                    const isSelected = selectedAlbums.has(album.id);
                    return (
                        <div
                            key={album.id}
                            onClick={() => toggleSelection(album.id)}
                            className="group relative bg-white rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-lg transition-all duration-200"
                        >
                            {/* Album Thumbnail */}
                            <div className="relative aspect-square bg-[#f8f9fa]">
                                {album.thumbnails.length === 1 ? (
                                    <Image
                                        src={album.thumbnails[0]}
                                        alt={album.title}
                                        fill
                                        className="object-cover"
                                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 20vw, 16vw"
                                    />
                                ) : album.thumbnails.length === 2 ? (
                                    <div className="grid grid-cols-2 h-full gap-0.5">
                                        {album.thumbnails.slice(0, 2).map((thumb, idx) => (
                                            <div key={idx} className="relative">
                                                <Image
                                                    src={thumb}
                                                    alt={`${album.title} ${idx + 1}`}
                                                    fill
                                                    className="object-cover"
                                                    sizes="(max-width: 640px) 25vw, (max-width: 1024px) 16vw, (max-width: 1280px) 10vw, 8vw"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 h-full gap-0.5">
                                        {album.thumbnails.slice(0, 4).map((thumb, idx) => (
                                            <div key={idx} className="relative">
                                                <Image
                                                    src={thumb}
                                                    alt={`${album.title} ${idx + 1}`}
                                                    fill
                                                    className="object-cover"
                                                    sizes="(max-width: 640px) 25vw, (max-width: 1024px) 16vw, (max-width: 1280px) 10vw, 8vw"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {/* Selection Overlay */}
                                <div className={`absolute top-2 left-2 z-10 transition-all duration-200 ${
                                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                }`}>
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                                        isSelected 
                                            ? 'bg-[#1a73e8] border-2 border-white' 
                                            : 'bg-white/90 border-2 border-white/80 shadow-sm'
                                    }`}>
                                        {isSelected && (
                                            <CheckCircle2 className="w-4 h-4 text-white fill-white" />
                                        )}
                                    </div>
                                </div>

                                {/* Hover Overlay */}
                                <div className={`absolute inset-0 transition-opacity duration-200 ${
                                    isSelected 
                                        ? 'bg-[#1a73e8]/20 opacity-100' 
                                        : 'bg-black/0 group-hover:bg-black/10 opacity-0 group-hover:opacity-100'
                                }`} />
                            </div>

                            {/* Album Info */}
                            <div className="p-3">
                                <h3 className="text-sm font-medium text-[#202124] mb-1 truncate">
                                    {album.title}
                                </h3>
                                <p className="text-xs text-[#5f6368]">
                                    {album.count} {album.count === 1 ? 'item' : 'items'}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
