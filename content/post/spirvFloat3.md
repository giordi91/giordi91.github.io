---
date: 2020-01-26T08:53:02-00:00
linktitle: HLSL Viewport Clamping 
title: "SPIR-V vec3 buffers"
tags : ["shader","spirv"]
tocname: "Table of contents:"
toc : true
draft: true
---

<br><br>
<p style="background:gray;padding: 1em;">
You just add a vec3 storage buffer in your GLSL shader.... but can't index it properly, let us find out why
</p>

<br><br>

![intro](../images/20_spirvvec3/cover.png)
<br><br>

# vec3 buffers indexing fights back again 

I am neck deep in the refactor of my engine, getting the Vulkan back end in a good state. During my work to start rendering
meshes in a uniform way for both DX12 and VK, I refactored how my mesh is stored and ditched the input assembler directly 
in favor of directly reading data from buffers (still using the index buffer).

I wrote a shader with this snippet of code in it:

```glsl
layout (set=1,binding=0) buffer vertices
{
    vec3 p[];
};
```

I am usually weary of data types packing for anything that is not 16 bytes aligned, especially in constant buffers, but this is was a storage 
buffer, the closest thing you can get to a normal flat array allocation you can get in GLSL. As you can imagine, this did not go very well, the mesh was not being read properly, I witnessed really weird behaviours where initial values seems to be read properly and then just started being all garbage
(possibly misaligned reads).

I quickly went in the shader, fixed to vec4, padded my mesh and voila! Problem fixed, let us move on! See you in the next blog post!
Not so fast, that would be all good but I wanted to know why, the naive me would expect to work, possibly bit less efficient but still, working.

#Alignment issues

I decided to ask Matthäus Chajdas (@NIV_Anteru) to know more of the underlying details, and he was nice enough to spend the time to help me.
His initial thought was that it should have worked with the right layout. Naive me jumps back in and shouts that I did indeed have have a layout! 

```glsl
layout (set=1,binding=0) buffer vertices
```

What he meant was the right memory layout! As an example:

```glsl
layout (scalar, set=1, binding=0) 
```

This is one of those moments when you realize you completely missed knowledge of whole set of features of the API! So back to reading the docs.
I found some interesting links to look at:

* {{<target-blank "VK 1.2 layout offset and aligments" "https://www.khronos.org/registry/vulkan/specs/1.2-extensions/html/chap14.html#interfaces-resources-layout">}}
* {{<target-blank "Khronos Wiki layout qualifiers" "https://www.khronos.org/opengl/wiki/Layout_Qualifier_(GLSL)">}}
* {{<target-blank "Memory layout" "https://www.khronos.org/opengl/wiki/Interface_Block_(GLSL)#Memory_layout">}}
* {{<target-blank "Enhanced layouts" "https://www.khronos.org/registry/OpenGL/extensions/ARB/ARB_enhanced_layouts.txt ">}}

With this new informations we can see that in the specification of layout offset and alignment we find:

```
A three- or four-component vector has a base alignment equal to four times its scalar alignment.
```

To note that this can't be simply fixed with std430 memory layout, I tried and is not enough. The actual solution is the extension:
```
GL_EXT_scalar_block_layout 
```

On the 
{{<target-blank "page" "https://github.com/KhronosGroup/GLSL/blob/master/extensions/ext/GL_EXT_scalar_block_layout.txt">}}
of the actual extension we find this very important line:

```
This new layout aligns values only to the scalar components of the block and its composite members.
```
That is exactly the behaviour we wanted, this would change the alignment of our vec3 from 16 bytes to 4.

#SPIR-V enters the fight

Matthäus also provided me with this amazing example from {{<target-blank "shader playground" "http://shader-playground.timjones.io/07e64f69c551fcc5e3e3d50b26ce981f">}} that would actually shows up what happens at SPIR-V level:

Original shader:
```glsl
#version 450
#define FIX_IT 0
#if FIX_IT
#extension GL_EXT_scalar_block_layout : require
layout (scalar, set=1,binding=0) buffer vertices
#else
layout (set=1,binding=0) buffer vertices
#endif
{
    vec3 p[];
};

out gl_PerVertex {
	vec4 gl_Position;
};

void main()
{
    gl_Position = vec4(p[0],1);
}
```

As we can see we have a define changing the different layout declaration of our buffer to compare the different results.

Here an slice of the SPIR-V

```
                 Name 17  ""
                              MemberDecorate 8(gl_PerVertex) 0 BuiltIn Position
                              Decorate 8(gl_PerVertex) Block
                              Decorate 14 ArrayStride 16
                              MemberDecorate 15(vertices) 0 Offset 0
                              Decorate 15(vertices) Block
                              Decorate 17 DescriptorSet 1
                              Decorate 17 Binding 0
               2:             TypeVoid
               3:             TypeFunction 2
               6:             TypeFloat 32
               7:             TypeVector 6(float) 4
 8(gl_PerVertex):             TypeStruct 7(fvec4)
               9:             TypePointer Output 8(gl_PerVertex)
              10:      9(ptr) Variable Output
              11:             TypeInt 32 1
              12:     11(int) Constant 0
              13:             TypeVector 6(float) 3
              14:             TypeRuntimeArray 13(fvec3)
    15(vertices):             TypeStruct 14
              16:             TypePointer StorageBuffer 15(vertices)
              17:     16(ptr) Variable StorageBuffer
              18:             TypePointer StorageBuffer 13(fvec3)
```

By investigating the SPIR-V we can notice several interesting things, the vertices array is defined as a struct referring to id 14

```
Decorate 14 ArrayStride 16
TypeStruct 14
```

This defines a struct with a stride of 16 bytes, few lines below we actually see the definition of the pointer to the storage buffer:

```
TypeRuntimeArray 13(fvec3)
TypePointer StorageBuffer 13(fvec3)
```

This is specifying that we have have an array defined at runtime of which we don't know the length, and the pointer of that is a fvec3.
If we put this two informations together we can see we are defining a pointer to float vec3 but with a stride of 16. From this we can deduce that our 
our shader would work if we padded our mesh to vec4, no shader changes required, no need to change the buffer to vec4 (Although possibly readability).

We do have that lovely define, why don't we flip it and see what happens? Here the result:

``` 
                   Name 17  ""
                              MemberDecorate 8(gl_PerVertex) 0 BuiltIn Position
                              Decorate 8(gl_PerVertex) Block
                              Decorate 14 ArrayStride 12
                              MemberDecorate 15(vertices) 0 Offset 0
                              Decorate 15(vertices) Block
                              Decorate 17 DescriptorSet 1
                              Decorate 17 Binding 0
               2:             TypeVoid
               3:             TypeFunction 2
               6:             TypeFloat 32
               7:             TypeVector 6(float) 4
 8(gl_PerVertex):             TypeStruct 7(fvec4)
               9:             TypePointer Output 8(gl_PerVertex)
              10:      9(ptr) Variable Output
              11:             TypeInt 32 1
              12:     11(int) Constant 0
              13:             TypeVector 6(float) 3
              14:             TypeRuntimeArray 13(fvec3)
    15(vertices):             TypeStruct 14
              16:             TypePointer StorageBuffer 15(vertices)
              17:     16(ptr) Variable StorageBuffer
              18:             TypePointer StorageBuffer 13(fvec3)
```

Overall the structure is exactly the same but the game change line is this:


```
Decorate 14 ArrayStride 12
```

Now our vec3 will have alignment requirement of scalar, in this case scalar multiple of the size of our type, giving us an alignment of 12 bytes.
With this then finally the shader works and behaves as expected with no extra padding.

# Performances?
Since I was messing around with this stuff I decided to have a go and have a look at the actual disassembly for the vec3 vs vec4. 

Here below code for the vec4:
```
s_waitcnt_depctr       0xffe3
buffer_load_dwordx4    v[0:3], v0, s[4:7], 0 offen
s_waitcnt              vmcnt(0)
exp                    pos0, v0, v1, v2, v3 done
```

Here the code for the vec3:
```
  s_waitcnt_depctr  0xffe3                              // 000000000090: BFA3FFE3
  buffer_load_dwordx3  v[0:2], v0, s[4:7], 0 offen      // 000000000094: E03C1000 80010000
  v_mov_b32     v3, 1.0                                 // 00000000009C: 7E0602F2
  s_waitcnt     vmcnt(0)                                // 0000000000A0: BF8C3F70
  exp           pos0, v0, v1, v2, v3 done  
```

As we can see the only real difference is in the memory load, where in the case of the vec4, we are loading 16 bytes worth of data v[0:3]
meanwhile in the vec3 we are loading only 12 v[0:2] plus an extra register load for the constant 1.0 in v3.
Register pressure is exactly the same in both cases, so the only difference when it comes to amount of code is the extra register load for the 1.0f value
we have. Which one is the fastest I have no idea and would need to be benchmarked, on one side we have less memory loaded and an extra register set but not aligned to 16 bytes, I doubt the extra register set has any effect on performance and boils down only to the memory system. If you happen to 
have experience with this or data please let me know! I would love to hear it!
This will require further investigation. 

# Conclusion
This is the end of the run in this rabbit hole, it was quite interesting and I am getting quite the linking to SPIR-V the more I deal with it!Thank 
so much to Matthäus for enduring my questions! Give him a follow since he often contributes to very interesting conversations. 
When it comes to my project, for the time being I am using vec4 and moving on to other stuff. I do plan at one point to do a nice pass on the geometry
where I start using 
meshoptimizer
compressing the data and so on, that might be a good time to revisit the topic.

If you liked this blog post share it around and follow on twitter! @MGDev91.







<br><br>

