
---
date: 2019-11-30
linktitle: glslang spirv 
title: "Glslang and SPIR-V version"
tags : ["shader","gpu","vulkan"]
tocname: "Table of contents:"
toc : true
draft : true 
---

<p style="background:gray;padding: 1em;">
How to make sure that your offline compiled SPIR-V matches your runtime
</p>

<br><br>
![intro](../images/18_glslang/logo.png)
<br><br>

# The problem 

Some of you might know that I started the process of adding a Vulkan back end to my DX12 engine,
it will be my xmas project. Due to that I decided to be a lot more active in reporting my Vulkan 
experience on my blog by doing some shorter article on interesting findings/problems.

Today we are talking about compiling shaders. In particular, I wanted a way to compile shader programmatically
from C++, that is due to the fact I wanted to add offline compilation of shaders to my
{{<target-blank "resource compiler" "https://giordi91.github.io/post/resource_compiler/">}}.

I ended up by using 
{{<target-blank "glslang" "https://github.com/KhronosGroup/glslang">}}, it is suprisingly easy to build, so I just added
as a submodule to my github repository and ran with it. This allowed me to perform offline compilation and simply load
the SPIR-V blob at runtime for bulding the graphics pipeline (altough even that will be moved to offline compilation later on).
Everything worked just fine, until I upgraded the vulkan SDK to `1.1.126` and then got a new validation layer error:

```
ERROR: SPIR-V module not valid: 
Invalid SPIR-V binary version 1.5 for target environment SPIR-V 1.3 (under Vulkan 1.1 semantics).
```

# The solution

The error was quite clear, I was compiling for SPIR-V 1.5 but the runtime supported SPIR-V 1.3, my shaders are way too advanced, what can I say.
Joke asides, I started googling around if there was a way to get the supported max runtime version for SPIR-V. Unluckily my google foo failed
me. Altough I did find some github issues about an old validation layer bug report, among the replies there was one from 
{{<target-blank "Baldur Karlsson" "https://twitter.com/baldurk">}}, so I thought I would jump in the discord and bother him a little bit 
:D (thank you for your patience!).

Before jumping in the discussion let me show you a quick snipped in how I was setting the SPIR-V version in my shader compiler:

```cpp
  int clientInputSemanticsVersion = 110; // maps to, say, #define VULKAN 110
  glslang::EShTargetClientVersion vulkanClientVersion =
      glslang::EShTargetVulkan_1_1;
  glslang::EShTargetLanguageVersion targetVersion = glslang::EShTargetSpv_1_5;

  shader.setEnvInput(glslang::EShSourceGlsl, shaderType,
                     glslang::EShClientVulkan, clientInputSemanticsVersion);
  shader.setEnvClient(glslang::EShClientVulkan, vulkanClientVersion);
  shader.setEnvTarget(glslang::EShTargetSpv, targetVersion);
```

From the above you can see that I was explicitely targetting SPIR-V 1.5 (not for any reason, but I just picked the highest in the enum).
My goal was to find a variable of sort (quering maybe the Physical device or the runtime) to know the maximum supported SPIR-V version on the target
enviroment, I did not manage to find any, altough it is the Vulkan specs stating for each VK version what SPIR-V version must be supported.
If anyone knows a way I would love to know.

From what I could gather the situation right now is:
- VK 1.0.0 -> SPIR-V 1.0
- VK 1.1.0 -> SPIR-V 1.3

This is when I aksed Baldurs if he knew a way to query such value, after asking me what compiler I was using, he pointed out that if I only set:
```cpp
  glslang::EShTargetClientVersion vulkanClientVersion = glslang::EShTargetVulkan_1_1;
```

glslang will figure out what version of SPIR-V to target. He also told me that by setting targetVersion, I was overriding my previous ```setEnvClient```
call. In short, is enough to set ```setEnvClient```, and no need to set the SPIR-V version aswell. Giving the following code:

```cpp
  int clientInputSemanticsVersion = 110; // maps to, say, #define VULKAN 110
  glslang::EShTargetClientVersion vulkanClientVersion =
      glslang::EShTargetVulkan_1_1;
  shader.setEnvInput(glslang::EShSourceGlsl, shaderType,
                     glslang::EShClientVulkan, clientInputSemanticsVersion);
  shader.setEnvClient(glslang::EShClientVulkan, vulkanClientVersion);
```

Once that was sorted and my shader re-compiled the error went away. Hope it helps!

See you next time.

<br><br>


<br><br>
