---
date: 2020-05-30
linktitle: rust disass 
title: "Rust Disassembly: part 2"
tags : ["rust","disassembly"]
tocname: "Table of contents:"
toc : true
draft : true 
---

<p style="background:gray;padding: 1em;">
What do some Rust features compile to?
</p>

![intro](../images/22_rust1/logo.png)
<br><br>

# Intro 
Let us continue our adventure we started in the previous 
{{<target-blank "post" "https://giordi91.github.io/post/disassemlbyrust1/">}} and lets check some more Rust construct!

# addition checks 
Meanwhile working throught the {{<target-blank "Rust book" "https://doc.rust-lang.org/book/">}},I noticed the author mentioning overflow checks on operations like additions, so I decided to investigate:

```rust
pub fn add_overflow( a : u8 ) -> u8
{
    a + 300
}

```

Somethign simples like this won't simply compiler, the compiler knowns a is an ```u8``` and knows can't convert 300 to be a  ```u8``` aswell. So flat out refuses to compile it, fair enough. Let us try something a bit more 
tricky for the compiler.

```rust
pub fn add_overflow( a : u8 ) -> u8
{
    a + 255 
}

```

The value 255 is a valid ```u8``` value but is most likely to overflow, especially if ```a``` is positive, what does the result asm looks like? (Compiled with ```-C opt-level=0```)

```asm
example::add_overflow:
    push    rax
    add     dil, 255
    setb    al
    test    al, 1
    mov     byte ptr [rsp + 7], dil
    jne     .LBB28_2
    mov     al, byte ptr [rsp + 7]
    pop     rcx
    ret
.LBB28_2:
    lea     rdi, [rip + str.0]
    lea     rdx, [rip + .L__unnamed_8]
    mov     rax, qword ptr [rip + core::panicking::panic@GOTPCREL]
    mov     esi, 28
    call    rax
    ud2
```

We can see the code doing the addition normally but then issuing a ```setb``` and ```test``` instruction, what is doing there is checking for the overflow flag. If overflow happend then we go to panic land (after some stack juggling).
As usual, hold your horses! 
I have been playing a bit dirty here, as you can see from few lines above, I have compiled with no optimizations, if we switch the optimizations what kind of asm do we get?

```asm
example::add_overflow:
    lea     eax, [rdi -1]
    ret
```

As expected, as soon as we have any sort of optimization enabled, even just ```-C opt-level=1``` or higher, the whole panic and error check is out of the window and the compiler is more than happy to let underflow and overflow happen.

If you were wondering why there is not an ```ADD``` instruction there but an ```LEA``` that is due to a smart optimization. The ```LEA``` instruction is a very power and flexible instructions, which allows to pack some extra computation if used 
properly. In this case the compiler is able to pack the computation in the RHS and have the LHS be eax, which is exactly wher you want your value to be for the return value.

If done with an add, you would have had to do something like that
```asm
add rdi, 255
mov eax, rdi
```

In general in assembly less code means faster. In this specific case we get the same result with one instruction instead of two, and is a common optimization done by compilers to (ab)use the ```LEA``` instruction.


# Enums

This is going to be a big one! Enums are a big part of the Rust language, and differ quite greatly from the other languages. My suprise was to realize that Enums in Rust can hold data, and such data can be different per enum's value.
I was really curious to see how such feature would behave! The first step was to disassamble a simple example:

```rust

pub enum Color
{
    RGBA(u8,u8,u8,u8),
    HEX(u32)
}


pub fn extract(color:Color) -> u8
{
    match color{
        Color::RGBA(_,_,b,_) => b,
        Color::HEX(c) => c as u8
    }
}

```

here the resulting asm:
```asm
example::extract:
    cmp     byte ptr [rdi], 1
    jne     .LBB11_2
    mov     al, byte ptr [rdi + 4]
    ret
.LBB11_2:
    mov     al, byte ptr [rdi + 3]
    ret
```

There is a lot of interesting things going on here! First of all we can see the match statement checking which branch to get, in this case we only have two options, which maps to 0 and 1. The compiler decided to check against 1:
```asm
    cmp     byte ptr [rdi], 1
```

Note the comparison against a ```byte``` we will get back to that later. Next we see a simple jump, if the value is not equal to one, it simply returns the third value in the RGBA color:
```asm
    mov     al, byte ptr [rdi + 3]
```
Each channel has a size of 1 byte, so makes sense to shift by 3. Finally the first branch is quite interesting, You might expect a cast or similar to convert from u32 to u8, but hat is simply a truncation, as such the compiler decided to just grab the lowest byte
```asm
    mov     al, byte ptr [rdi + 4]
```

All this is very cool, is so interesting to see the crazy optimizations the compilers can do, in the end this specific match statement is nothing more than a if/else as the reader might expect. This got me thinking, how would I impelment something like that?
I did some similar things in the past where I used a union, looks like I was not far off, looks like in Rust, enum are implemented as {{<target-blank "tagged unions" "https://doc.rust-lang.org/reference/items/unions.html">}}.

I was intrigued to figure out the memory layout and sizes, so let us have a look.

```rust
pub fn szColor() -> usize {
    mem::size_of::<Color>()
}
```

A very simple function returning the size of the struct, here the asm:
```asm
example::szColor:
    mov     eax, 8
    ret
```

Our struct is 8 bytes, my initial idea was that Rust was using an i32 to implement the enum tag and the rest was for our union. Would make sense, 4bytes of tag + 4 bytes of data. I was wrong, next I started adding channels to my now "broken" RGBA:


```rust
pub enum Color
{
    RGBA(u8,u8,u8,u8,u8),
    HEX(u32)
}
```
Size was still 8, interesting, I kept adding ```u8```s until I reached a tipping point:

```rust
pub enum Color
{
    RGBA(u8,u8,u8,u8,u8,u8,u8,u8),
    HEX(u32)
}
```
```asm
example::szColor:
    mov     eax, 12
    ret
```

What does tell us? Two things mostly, the first is that in this case, the compiler was able to see that only one byte was necessarey to encode all the possible values of the tag having only two options. The second thing is that once it figured out,
the compiler aggressively packed the resulting enum to avoid extra padding. That is why having a 7bytes color still allowed to have a total size of 8bytes. Quite cool!.

# Struct packing

This aggressive packing made me even more curious, what if I tried to do someme poor struct layout? Would I get padding? Here the test:
```rust
pub enum Side 
{
    Left,
    Right
}

struct EnumPacking
{
    x:i32,
    _side2 :Side
}

pub fn szSize() -> usize {
    mem::size_of::<Side>() + szStrEnum()
}


pub fn szStrEnum() -> usize {
    mem::size_of::<EnumPacking>()
}

```
 
The setup is, given the simple enum what would be the size? What if then we add it to a struct with other data?  Apologies for the ```szSize```, for some reasons that was the only way I found to get Compiler Explorer to not optimize out the function.
```szSize``` generates this code:

```asm
example::szSize:
    mov     eax, 9
    ret
```

Our struct is of size 8bytes and the enum is 1 byte, for a total of 9 bytes. I did verify that in CE, but feel free to do the same with the provided link. Interestingly without data, the compiler still decided to pack the enum in one byte instead of 4. 
The struct instead, has a size of 8, which means we are getting 3 bytes of padding at the end. Next I dediced to try to mess the layout even more:

```
struct EnumPacking
{
    _side1 :Side
    x:i32,
    _side2 :Side
}
```

I would have expected a size of 12 bytes, getting 3bytes padding after ```_side1``` and other 3 bytes after ```_side2```. That was not the case, output was exactly the same, 8 bytes. Such result called for more digging! 
The research revealed that unless we require the struct to have a C layout, the rust compiler does not guarantee the order of the members, in this case the compiler leveraged that fact to avoid unnecessary padding.
Let us force the C layout:

```rust
#[repr(C)]
struct EnumPacking
{
    _side1 :Side
    x:i32,
    _side2 :Side
}

```

Now the result is quite the expected one:

```asm
example::szSize:
    mov     eax, 13
    ret


```

Here we get the expected 12 bytes + one of the enum.

# Conclusion
The  post is already starting to get long, so let us stop here for now. Let us continue in part3! As usual if you liked it feel free to leave a comment and share the article around!
