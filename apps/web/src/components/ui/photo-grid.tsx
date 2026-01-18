'use client';

import { CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

// Mock Data with more realistic aspect ratios
const PHOTO_GROUPS = [
    {
        date: 'Today',
        photos: [
            { id: 1, src: 'https://picsum.photos/id/10/800/600', aspect: 1.33 },
            { id: 2, src: 'https://picsum.photos/id/12/600/800', aspect: 0.75 },
            { id: 3, src: 'https://picsum.photos/id/14/800/800', aspect: 1 },
            { id: 4, src: 'https://picsum.photos/id/16/800/600', aspect: 1.33 },
            { id: 5, src: 'https://picsum.photos/id/18/800/600', aspect: 1.33 },
            { id: 6, src: 'https://picsum.photos/id/19/600/800', aspect: 0.75 },
            { id: 7, src: 'https://picsum.photos/id/21/800/600', aspect: 1.33 },
        ]
    },
    {
        date: 'Yesterday',
        photos: [
            { id: 8, src: 'https://picsum.photos/id/20/600/800', aspect: 0.75 },
            { id: 9, src: 'https://picsum.photos/id/22/800/600', aspect: 1.33 },
            { id: 10, src: 'https://picsum.photos/id/25/800/800', aspect: 1 },
            { id: 11, src: 'https://picsum.photos/id/28/600/800', aspect: 0.75 },
            { id: 12, src: 'https://picsum.photos/id/29/800/600', aspect: 1.33 },
        ]
    },
    {
        date: 'Sat, Jan 14',
        photos: [
            { id: 13, src: 'https://picsum.photos/id/30/800/600', aspect: 1.33 },
            { id: 14, src: 'https://picsum.photos/id/32/800/600', aspect: 1.33 },
            { id: 15, src: 'https://picsum.photos/id/34/600/800', aspect: 0.75 },
            { id: 16, src: 'https://picsum.photos/id/36/800/600', aspect: 1.33 },
            { id: 17, src: 'https://picsum.photos/id/38/800/600', aspect: 1.33 },
            { id: 18, src: 'https://picsum.photos/id/40/600/800', aspect: 0.75 },
            { id: 19, src: 'https://picsum.photos/id/42/800/800', aspect: 1 },
            { id: 20, src: 'https://picsum.photos/id/44/800/600', aspect: 1.33 },
        ]
    }
];

export function PhotoGrid() {
    const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());

    const toggleSelection = (id: number) => {
        const newSelected = new Set(selectedPhotos);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedPhotos(newSelected);
    };

    return (
        <div className="pb-20">
            {PHOTO_GROUPS.map((group, groupIdx) => (
                <div key={groupIdx} className="mb-12">
                    <h3 className="text-sm font-medium text-[#5f6368] mb-3 ml-1 font-normal">
                        {group.date}
                    </h3>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-1">
                        {group.photos.map((photo) => {
                            const isSelected = selectedPhotos.has(photo.id);
                            return (
                                <div
                                    key={photo.id}
                                    onClick={() => toggleSelection(photo.id)}
                                    className="relative group bg-[#f8f9fa] rounded-sm overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg"
                                    style={{
                                        aspectRatio: photo.aspect.toString(),
                                    }}
                                >
                                    {/* Selection Checkbox */}
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

                                    <Image
                                        src={photo.src}
                                        alt="Photo"
                                        fill
                                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 20vw, 14vw"
                                        className="object-cover"
                                        loading="lazy"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
