"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Image, Bell, Play, FileText, Monitor, Star, Users, MapPin, Video, Clock, Archive, Cloud, Aperture, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useSidebar } from '@/contexts/sidebar-context';

const NAV_ITEMS = [
    { icon: Image, label: 'Photos', href: '/photos' },
    { icon: Bell, label: 'Updates', href: '/updates' },
];

const COLLECTION_ITEMS = [
    { icon: Play, label: 'Albums', href: '/' },
    { icon: FileText, label: 'Documents', href: '/documents' },
    { icon: Monitor, label: 'Screenshots and saved files', href: '/screenshots' },
    { icon: Star, label: 'Favorites', href: '/favorites' },
    { icon: Users, label: 'People & pets', href: '/people' },
    { icon: MapPin, label: 'Places', href: '/places' },
    { icon: Video, label: 'Videos', href: '/videos' },
    { icon: Clock, label: 'Recently added', href: '/recent' },
    { icon: Archive, label: 'Archive', href: '/archive' },
];

export function Sidebar() {
    const { isOpen, close } = useSidebar();

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={close}
                    aria-hidden="true"
                />
            )}

            <aside
                className={clsx(
                    "fixed left-0 top-0 h-full w-[240px] flex flex-col bg-[#f8f9fa] border-r border-[#e8eaed] z-50 transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                )}
            >
                <div className="p-4 pl-6 flex items-center justify-between h-16 bg-[#f8f9fa]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4285f4] to-[#34a853] flex items-center justify-center">
                            <Aperture className="w-5 h-5 text-white" fill="white" />
                        </div>
                        <span className="text-xl font-normal text-[#3c4043] tracking-tight">Edith</span>
                    </div>
                    <button
                        onClick={close}
                        className="md:hidden p-2 text-[#5f6368] hover:bg-[#e8eaed] rounded-lg transition-colors"
                        aria-label="Close sidebar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

            <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto bg-[#f8f9fa]">
                <ul className="space-y-0.5">
                    {NAV_ITEMS.map((item) => (
                        <NavItem key={item.href} item={item} />
                    ))}
                </ul>

                <div className="px-3 py-2 mt-4">
                    <div className="text-xs font-medium text-[#5f6368] uppercase tracking-wide mb-2">
                        Collections
                    </div>
                    <ul className="space-y-0.5">
                        {COLLECTION_ITEMS.map((item) => (
                            <NavItem key={item.href} item={item} />
                        ))}
                    </ul>
                </div>
            </nav>

            <div className="p-4 border-t border-[#e8eaed] bg-[#f8f9fa]">
                <div className="mb-3">
                    <div className="text-xs text-[#5f6368] mb-1.5 flex items-center gap-1.5">
                        <Cloud className="w-3.5 h-3.5" />
                        <span>Storage space</span>
                    </div>
                    <div className="text-xs text-[#5f6368] mb-2">
                        77.3 GB used of 100 GB
                    </div>
                    <button className="text-xs text-[#1a73e8] hover:underline">
                        Buy more storage space
                    </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5f6368]">
                    <a href="#" className="hover:underline">Privacy</a>
                    <a href="#" className="hover:underline">Terms</a>
                    <a href="#" className="hover:underline">Policy</a>
                </div>
            </div>
        </aside>
        </>
    );
}

function NavItem({ item }: { item: { icon: any, label: string, href: string } }) {
    const pathname = usePathname();
    const isActive = pathname === item.href;

    return (
        <li>
            <Link
                href={item.href}
                className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-normal transition-colors",
                    isActive
                        ? "bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#e8f0fe]"
                        : "text-[#5f6368] hover:bg-[#e8eaed] hover:text-[#3c4043]"
                )}
            >
                <item.icon className={clsx("w-5 h-5", isActive ? "text-[#1a73e8]" : "text-[#5f6368]")} />
                {item.label}
            </Link>
        </li>
    );
}
