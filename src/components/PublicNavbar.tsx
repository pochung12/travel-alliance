"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Plane, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function PublicNavbar() {
  const [open, setOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
  }, []);

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50 border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-cyan-600 font-bold text-xl shrink-0">
          <Plane className="w-6 h-6" />
          <span className="hidden sm:block">Travel Alliance 旅遊大聯盟</span>
          <span className="sm:hidden font-bold">旅遊大聯盟</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6">
          <Link href="/tours" className="text-sm text-slate-600 hover:text-cyan-600 font-medium transition-colors">
            所有行程
          </Link>
          <Link href="/tours?cat=group" className="text-sm text-slate-600 hover:text-cyan-600 font-medium transition-colors">
            團體旅遊
          </Link>
          <Link href="/tours?cat=island" className="text-sm text-slate-600 hover:text-cyan-600 font-medium transition-colors">
            海島度假
          </Link>
          <Link href="/tours?cat=family" className="text-sm text-slate-600 hover:text-cyan-600 font-medium transition-colors">
            親子旅遊
          </Link>
          <Link href="/blog" className="text-sm text-amber-600 hover:text-amber-700 font-medium transition-colors">
            旅遊誌
          </Link>
        </div>

        {/* Desktop right buttons */}
        <div className="hidden md:flex items-center gap-2">
          {!isLoggedIn && (
            <>
              <Link href="/login"
                className="text-sm text-slate-600 hover:text-cyan-600 font-medium px-3 py-2 transition-colors">
                登入
              </Link>
              <Link href="/register"
                className="text-sm bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                註冊
              </Link>
            </>
          )}
          <Link href="/admin"
            className="flex items-center gap-1.5 text-sm border border-cyan-600 text-cyan-600 hover:bg-cyan-50 px-4 py-2 rounded-lg font-medium transition-colors">
            <Plane className="w-3.5 h-3.5" />
            進入後台
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 text-slate-600 hover:text-cyan-600 transition-colors"
          aria-label="開啟選單"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-3 space-y-1">
          <Link href="/tours" className="block py-2.5 text-sm text-slate-700 hover:text-cyan-600" onClick={() => setOpen(false)}>
            所有行程
          </Link>
          <Link href="/tours?cat=group" className="block py-2.5 text-sm text-slate-700 hover:text-cyan-600" onClick={() => setOpen(false)}>
            團體旅遊
          </Link>
          <Link href="/tours?cat=island" className="block py-2.5 text-sm text-slate-700 hover:text-cyan-600" onClick={() => setOpen(false)}>
            海島度假
          </Link>
          <Link href="/tours?cat=family" className="block py-2.5 text-sm text-slate-700 hover:text-cyan-600" onClick={() => setOpen(false)}>
            親子旅遊
          </Link>
          <Link href="/blog" className="block py-2.5 text-sm text-amber-600 hover:text-amber-700 font-medium" onClick={() => setOpen(false)}>
            旅遊誌
          </Link>
          <div className="border-t border-slate-100 pt-2 mt-1 flex gap-2">
            <Link href="/login" className="flex-1 py-2 text-sm text-center border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50" onClick={() => setOpen(false)}>
              登入
            </Link>
            <Link href="/register" className="flex-1 py-2 text-sm text-center bg-cyan-600 text-white rounded-lg hover:bg-cyan-700" onClick={() => setOpen(false)}>
              註冊
            </Link>
          </div>
          <Link href="/admin" className="block py-2 text-sm text-center border border-cyan-600 text-cyan-600 rounded-lg hover:bg-cyan-50 mt-1" onClick={() => setOpen(false)}>
            進入後台
          </Link>
        </div>
      )}
    </nav>
  );
}
