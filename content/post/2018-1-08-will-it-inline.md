---
date: 2018-08-01
linktitle: will it inline
title: "Will it inline? Ep 1"
tags : ["disassambly","optimization"]
draft : true
---

In today's post we are going to talk about an interesting issue I came 
across meanwhile implementing a parallel bhv, the same presented in the 
Tero Karras 
<a href="https://devblogs.nvidia.com/thinking-parallel-part-iii-tree-construction-gpu/" target="_blank">blog post</a>
and (missing link) paper.

I do plan in the future to make one or more blog posts about it, 
either a c# or compute shader implementation, but today we are going to talk
about the c++ implementation I was working on.

After being done with the initial implementation pass, I started to have a look
at the performances, I made some simple wrapper functions for getting  the max of
two and three values:

```c++
inline float getMaxOf2(float a, float b) {
  a > b ? a : b;
}
```

You might think pretty overkill, but I did mainly for two reasons, make sure
the std was not doing any "bubu" and since I have the 3 variant just gave me
some consistency. In the end the built in Windows one is implemented the same way.

![msvc](../images/04_will_it_inline/msvc.jpg)






