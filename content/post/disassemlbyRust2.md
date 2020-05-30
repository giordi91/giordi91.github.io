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
{{<target-blank "post" "https://giordi91.github.io/post/disassemlbyrust1/">}} and lets check some more rust construct!

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

