import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";
export function middleware(request:NextRequest){const h=new Headers(request.headers);h.set("x-londos-pathname",request.nextUrl.pathname);return NextResponse.next({request:{headers:h}});}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|brand/|illustrations/|pwa/).*)"]};
