
date: 2020-05-23T08:37:38+01:00
linktitle: rust disass 
title: "Rust Disassambly: part 1"
tags : ["rust","disassembly"]
tocname: "Table of contents:"
toc : true
draft : false
---

<p style="background:gray;padding: 1em;">
What do some Rust features compile to?
</p>

![intro](../images/22_rust1/logo.png)
<br><br>

# Intro 

I have been starting to have a look at Rust lately, mostly because I started to get a liking to WASM and Rust has
the best tool in class to compile to WASM, or so I am told. I am eager to find by myself. 

Rust comes with several 
new idioms and structures in the language I am not used to, and being a performance enthusiast, I always get interested in what such constructs translate to.

I put together some tests that I will be discussing below, here the link to a compiler explorer 
{{<target-blank "compiler explorer" "https://godbolt.org/z/Xbf-7u">}}
page.

# i128

One of the first things I came across was the i128 datatype, allowing to stuff up to 128 bits in an integer, I was curious 
to see how that was actually handled:

```rust
// testing i128
pub fn add128(a : i128, b: i128) -> i128 {
    a + b
}

pub fn mul128(a : i128, b: i128) -> i128 {
    a * b
}
```

Which translates to:

```asm
example::add128:
    mov     rax, rdi
    add     rax, rdx
    adc     rsi, rcx
    mov     rdx, rsi
    ret

example::mul128:
    mov     r8, rdx
    mov     rax, rdx
    mul     rdi
    imul    rsi, r8
    add     rdx, rsi
    imul    rcx, rdi
    add     rdx, rcx
    ret

```

As most of you probably expected the i128 bits are implemented in software, it becomes especially clear in the addition where
we see a first addition followed by an ```adc``` instruction, which takes care of adding the carry flag as well in case was set.
Pretty cool!

# Destructuring

The second feature I came across is called destructuring; it is one way to access data of a tuple, mind you a tuple can have heterogeneous data types in it, that is an important detail as we will see in a second. Here an example of destructuring.

```rust
// destructuring
pub fn destructuring(a : (f32, f32,f32)) -> f32 {
    let (_,_,z) = a;
        z
}

pub fn destructuring2(a : (f32, f32,f32)) -> f32 {
    a.2
}
```

Here the resulting asm:

```asm
example::destructuring:
    movss   xmm0, dword ptr [rdi + 8]
    ret
```

The compiler has no problem understanding what the user wants to extract and can optimize all the destructuring that
is not needed. The compiler is merely shifting the pointer to where we wisth to read: ```[rdi + 8]``` , if we decided to access the second element we would see : ```[rdi + 4]```.

The destructuring2 two function generates exactly the same code. Interingly enough we can't access an elment by an index, something like this is not legal:

```rust
pub fn destructuring2(a : (f32, f32,f32), b: usize) -> f32 {
    a.b
}
```

Given the fact that would be ambiguous for the language grammar, to begin with, the compiler would not be able to see what value you wish
to unpack giving troubles with the fact that tuples can contain heterogeneous types.


# Arrays
Next on the list is arrays.

```rust
//arrays
pub fn array1() -> i32 {
    let a = [1,2,3,4,5];
    a[2]
}

pub fn array2( a: &[i32;5]) -> i32 {
    a[4]
}

pub fn array3( a: &[i32;5], b: usize) -> i32 {
    a[b]
}
```

Here some different examples of array usage. In the first and second, the compiler is able to see what the user wants
to do and is able to optimize the heck out of it, here the generated assembly for the first two tests:

```asm
example::array1:
    mov     eax, 3
    ret

example::array2:
    mov     eax, dword ptr [rdi + 16]
    ret

```

As we can see, in the first case, the compiler nukes the array entirely and returns the wanted value as expected, the second examples
show a simple read by an offset and return. Pretty straight forward, but what if we use an index the compiler does not know at compile time like in the 3rd example? 

```asm
example::array3:
    push    rax
    cmp     rsi, 4
    ja      .LBB5_2
    mov     eax, dword ptr [rdi + 4*rsi]
    pop     rcx
    ret
.LBB5_2:
    lea     rdi, [rip + .L__unnamed_1]
    mov     edx, 5
    call    qword ptr [rip + core::panicking::panic_bounds_check@GOTPCREL]
    ud2
```

Ouch! Here we can see Rust memory safety coming into play. The compiler is not able to make sure at compile time that the memory access will be within the bounds of the array, as such we can first see a comparison with the array size (or better, to the maximum valid index which is size -1):


```asm
    cmp     rsi, 4
```

Which is not an expensive operation per se, but what it follows might be:
```asm
    ja      .LBB5_2
```

In the case our index is higher the the biggeste valid index we jump straight to panic land:

```
.LBB5_2:
    lea     rdi, [rip + .L__unnamed_1]
    mov     edx, 5
    call    qword ptr [rip + core::panicking::panic_bounds_check@GOTPCREL]
    ud2
```

First of all, let me say I love how it is literally called panic, second is the first time I meet the ```ud2``` instruction, 
very interesting!

At this point, a c++ programmer might think, oh well we rust is too slow, goodbye! Hold on for a second, let us not be too hasty, shall we? Sure accessing a random index might be bad, but what if we are iterating?


# Loops

Here our first loop example:

```rust
pub fn loop1( a: &[i32;5], b: usize) -> i32 {

    let mut idx: usize = 0;
    let mut total : i32 =0;
    while idx < b
    {
        total = total + a[idx];
        idx+=1;
    }
    total
}

```

In the above code, we are merely doing a reduce of the provided array, but we are passing the maximum iteration index to the function, this might be for several reasons like for example iterating a subset of the array.

Here the result

```asm
example::loop1:
    push    rax
    test    rsi, rsi
    je      .LBB6_1
    mov     eax, dword ptr [rdi]
    cmp     rsi, 1
    je      .LBB6_2
    add     eax, dword ptr [rdi + 4]
    cmp     rsi, 2
    je      .LBB6_2
    add     eax, dword ptr [rdi + 8]
    cmp     rsi, 3
    je      .LBB6_2
    add     eax, dword ptr [rdi + 12]
    cmp     rsi, 4
    je      .LBB6_2
    cmp     rsi, 5
    jne     .LBB6_9
    add     eax, dword ptr [rdi + 16]
    pop     rcx
    ret
.LBB6_1:
    xor     eax, eax
.LBB6_2:
    pop     rcx
    ret
.LBB6_9:
    lea     rdi, [rip + .L__unnamed_2]
    mov     esi, 5
    mov     edx, 5
    call    qword ptr [rip + core::panicking::panic_bounds_check@GOTPCREL]
    ud2
```

That is a bit more code than I expected, but a lot of exciting things here! First of all, it seems like the compiler
decided to unroll the loop, cool!

The second thing we can notice is that we don't have checks on the size of the container until we get to the last index of the array the compiler knows to be a valid index. After that, we are going to trigger panic mode. So not as bad as I initially thought.

But this is not an idiomatic use of Rust, in reality Rust prefers you to use iterators on collections, but why would that be the case,
let us find out:

```rust
pub fn loop2( a: &[i32;8]) -> i32 {
    let mut total : i32 =0;
    for var in a.iter()
    {
        total += var;
    }
    total
}
```

Here we are doing the same thing as above, but we are using an iterator, to iterate all the elements. Coming from c++ I am usually
a bit wary of using this kind of loops mostly because I had some terrible experiences with iterators, but that is a different story.
What sort of disassembly did we get?


```asm
example::loop2:
    movdqu  xmm0, xmmword ptr [rdi]
    movdqu  xmm1, xmmword ptr [rdi + 16]
    paddd   xmm1, xmm0
    pshufd  xmm0, xmm1, 78
    paddd   xmm0, xmm1
    pshufd  xmm1, xmm0, 229
    paddd   xmm1, xmm0
    movd    eax, xmm1
    ret
```

The above is **completely** different from the code we had before! As a first, we can see the loop has been completely unrolled and also vectorized! 

The first three instructions load the ints into 128bits register and do a vectorized add. After that, it will be shuffling the values down
to do a 2x wide add and finally the last add with the final value (I am 90% sure about this, I did not go all the way to check the provided masks for the shuffles.

To be fair, that was the best use case since 8 is a multiple of the SIMD register width, what if is not?

```rust
pub fn loop3( a: &[i32;5]) -> i32 {
    let mut total : i32 =0;
    for var in a.iter()
    {
        total += var;
    }
    total
}

```

```asm
example::loop3:
    movdqu  xmm0, xmmword ptr [rdi + 4]
    pshufd  xmm1, xmm0, 78
    paddd   xmm1, xmm0
    pshufd  xmm0, xmm1, 229
    paddd   xmm0, xmm1
    movd    eax, xmm0
    add     eax, dword ptr [rdi]
    ret
```

The generated code is quite similar, but the most important thing is there are no range checks, using an iterator the compiler can guarantee there won't be dangerous memory accesses outside the bounds of the array. This leads me to believe you can get into some "interesting" collections composition/zipping/destructuring that you often find in "idiomatic" python. 

Not sure how I feel about that yet but it seems it would help keep the compiler happy and performances up. 

I had quite a bit of fun checking this assembly out and learn lots in how Rust behaves; I will make sure to make another post if I find something interesting! If you liked to feel free to share around.