---
date: 2020-04-14T11:43:21+01:00
linktitle: wasm notes 
title: WASM notes to build and deploy
tags : ["wasm"]
tocname: "Table of contents:"
toc : true
draft: true
---

<p style="background:gray;padding: 1em;">
Most tutorial shows you how to load a basic function, but all falls apart as soon as you try anything more complex.
Some notes on the matter
</p>

<br><br>
![intro](../images/21_wasm/wasmlogo.png)
<br><br>

# To the web! 
Since the beginning of the year, University and work have been extremely demanding, I have not had time at all to work on my engine, mostly because the mental load is quite big. 
It is not something I can just get to it a couple of hours a week or dedicate a some time over weekend. For the time being I decided to work on a new project that I could dedicate
some of the already minimal spare time I have. The solution is 
{{<target-blank "Crafting Interpreters" "https://craftinginterpreters.com/">}}, the author just recently completed the book and I have been hitching to give it a shot.
I worked on my own language before, and I had a blast! Check {{<target-blank "babycpp" "https://github.com/giordi91/babycpp">}} out! 

Who knows maybe I might get a much slower, but homemade, alternative to lua in my engine! We shall see. I always wanted to compile the language to wasm and hosting it on my blog. 
That would also make my life much easier to share it around and have people messing with it.

Altough getting into webassembly was not as smoooth as I hoped it to be, so I decided to collect some notes on the matter.
<br><br>

# Stepping past the hello-world
The main issue I faced with getting webassembly was not the toolchain, that is actually amazing, getting emscripten and compiling my code was a breeze. I was surpised to see that 
my code base, using c++17 , templates and type traits got compiled no issue. As soon as you stick to the HTML/JS provided your code will run just fine. 
 

```cpp
  (type (;57;) (func (param i32 i32) (result i64)))
  (type (;58;) (func (param i32 i32 i64 i32) (result i64)))
  (type (;59;) (func (param f64) (result i64)))
  (type (;60;) (func (param i64 i64) (result f32)))
  (type (;61;) (func (param i64 i64) (result f64)))
  (type (;62;) (func (param f64) (result f64)))
  (import "env" "__assert_fail" (func (;0;) (type 13)))
  (import "env" "__cxa_atexit" (func (;1;) (type 3)))
  (import "wasi_snapshot_preview1" "fd_close" (func (;2;) (type 0)))
  (import "wasi_snapshot_preview1" "fd_read" (func (;3;) (type 10)))
  (import "wasi_snapshot_preview1" "fd_write" (func (;4;) (type 10)))
  (import "env" "abort" (func (;5;) (type 6)))
  (import "wasi_snapshot_preview1" "environ_sizes_get" (func (;6;) (type 1)))
  (import "wasi_snapshot_preview1" "environ_get" (func (;7;) (type 1)))
  (import "env" "__map_file" (func (;8;) (type 1)))
  (import "env" "__sys_munmap" (func (;9;) (type 1)))
  (import "env" "strftime_l" (func (;10;) (type 8)))
  (import "env" "emscripten_resize_heap" (func (;11;) (type 0)))
  (import "env" "emscripten_memcpy_big" (func (;12;) (type 3)))
  (import "env" "__handle_stack_overflow" (func (;13;) (type 6)))
  (import "env" "setTempRet0" (func (;14;) (type 4)))
  (import "wasi_snapshot_preview1" "fd_seek" (func (;15;) (type 8)))
  (import "env" "memory" (memory (;0;) 256 256))
  (import "env" "table" (table (;0;) 348 funcref))
  (func (;16;) (type 7) (result i32)
    i32.const 21840)
  (func (;17;) (type 6)
    call 405
    call 365
```
