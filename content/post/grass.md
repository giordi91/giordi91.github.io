---
date: 2020-09-06T17:17:44+01:00
linktitle: grass shader
title: "Grass Shader"
tags : ["shader"]
tocname: "Table of contents:"
toc : true
draft : true 
---

<p style="background:gray;padding: 1em;">
My take on realtime grass
</p>

![intro](../images/23_grass/thumb.png)

<br><br>


# Intro 

 The latest effort in my engine has been grass. After porting quite a bit of the DX12 functionality to Vulkan I got to a point where I wanted to work something new rather than just porting features to Vulkan.

At a glance what I did in my grass shader was:

- Using blue noise distribution for grass blades positions
- Vertex + fragment shader, no geometry/tessellation shader involved. No billboards real geo per blade.
- Tile based
- GPU driven, both culling and lodding happening on GPU, indirect rendering

I will now go discussing each of this different parts in more details

# A Lodding idea
It all started when a while back I started thinking about how would I go about working on a grass shader in my engine. I wanted to do something interesting potentially leveraging mesh shaders aswell. 
I had a fairly clear idea about using tiles for doing some GPU culling, what was not clear to me was how would I go about doing LODDing? Usually grass is very overdraw bound, and you want to limit as much as possible what you render, hence culling + lodding.

What I wanted to achieve was a simple way at runtime to grab a subset of points and still have them well distributed, no clumping or gaps I was sitting on it for a bit then it hit me, if I want to solve a distribution problem I need HIM!

![alan](../images/23_grass/alan.png)

The noise/distribution master is known as 
{{<target-blank "Alan Wolfe" "https://twitter.com/Atrix256">}}, he has been helping me since years in my game engine/graphics dev! After explaining my idea he pointed out that points from a blue noise distribution respect exactly the kind of distribution I was after, not only that but he linked me to one of his blog post with c++ code I could use directly. 

I created a commanline application able to generate tiles of such points. I generated 100 tiles of 10k points each. Took roughly 3 hours on a 6 core laptop (running on 12 threads), the code scales quadratically but being efficient was not the goal here. The points are generated once and baked down to a binary file. The data is ready time to do some rendering.

# The first implementation

After getting a clearer idea in how I would approach things, was time to get my hands dirty. I had experience in the past about expanding geometry in vertex shaders, in particular for 
{{<target-blank "hair" "https://giordi91.github.io/post/hairexpansion/">}}, that plus the fact that usually geometry shader is frowned upon and I dont have experience with it, I decided to implement the technique in vertex shader. As a base I used the great 
{{<target-blank "Roystan tutorial" "https://roystan.net/articles/grass-shader.html">}}, here the result:

{{< youtube AQtvuftK7vg>}}

Here the huge diffrence made if I use a proper albedo texture instead of basic interpolated color

{{< youtube jeNwKbLVg9c>}}

The initial result was not bad, performance was actually quite good, if I recall correclty I was rendering around 14 million vertices in around 1.5ms but take that with a grain of salt we are going to talk more about performance later.

When I showed the initial gif on the internet, 
{{<target-blank "Freek Hoekstra" "https://www.linkedin.com/in/freek-hoekstra/">}}
over at LinkedIn suggested to offset sampling of the wind texture based on the UV coordindate of the blade, the higher the vertex in the blade the more offset it would get, this simple trick really improved 
the effect, have a look for yourself.
<br><br>

<img loading=lazy src="../images/23_grass/grass3.gif" >

Immediately the grass feels more of a blade than a static piece of geo rotating, I also improved a bit the wind rotations to give it a more natural look.

In case you are interest in this video I cover a bit more the tiling working, but right now is a simple proof of concept, so I am just using a simple grid:
<br><br>
{{< youtube _jD0piSDYL8>}}
<br><br>

# GPU driven rendering
The next step was to get the GPU culling going, I started by implementing the concept of a main camera and an active camera in the engine, in this way I will be able to jump from one to the other easily 
and see if the culling is actually working. The setup is fairly basic but for now, but it will do. The culling shader will always use the main camera matrices to perform the culling, meanwhile for the render I will use the active camera. 

The culling happens in a compute shader, the first step is to compute a vote, informing me whether or not the tile survives the culling or not, next the surviving instances get compacted into a single array. I talk at length about the proces in this 
{{<target-blank "MPC R&D blog post" "https://www.mpc-rnd.com/unity-gpu-culling-experiments/">}}
I made a while back plus 
{{<target-blank "Kostas Anagnostou" "https://twitter.com/KostasAAA">}}
has some 
{{<target-blank "amazing" "https://www.youtube.com/watch?v=U20dIA3SLTs">}}
{{<target-blank "content" "https://interplayoflight.wordpress.com/2018/01/15/experiments-in-gpu-based-occlusion-culling-part-2-multidrawindirect-and-mesh-lodding/">}}
on culling, going in lots of details. Last time I have implemented something like this was on dx11, where wave instructions are not available if not from vendor specific extensions. Having wave instructions as first citizen made the code simpler and more efficient. Here the culling working:

<br><br>
![grass4](../images/23_grass/grass4.gif)
<br><br>

Actually the above is when culling goes wrong, in particular it is an issue on Intel IGPUs, which is currently being looked at being potentially a bug. Here the real culling working, in the below gif you can see me jumping from the main camera to active camera, the main camera frustum being rendered and matching the culled region of grass:

<br><br>
![grass8](../images/23_grass/grass8.gif)
<br><br>

# Actual lodding implementation

After the culling, the VPC and rasterizer were still my bottlenecks, so next logical step was implementing LODding. The lod computation happens at same time of the culling, and is a simple distance from the camera of the center of the tile, nothing fancy.
After coloring based on LOD result was the following:

<br><br>
![grass8](../images/23_grass/grass5.gif)
<br><br>

Of course distances are completely configurable and there I was simply testing, thus the short distances. Once the LOD is computed I perform four different scan operation, to compact tiles based on LOD values from 0 to 3. The result is stored in a single array separated by an offset. Finally, a small compute shader gets kicked off and will grab the result of the scan (acculmulation atomics) to populate four indirect buffers and finally clearning the atomics for the next frame.

In the vertex shader I will load the tile and use the LOD result to perform the usual calculation to figure out which tile and blade I need to process as explained before.
I have added configuration on the number of blades per lod to be used and we can use it to vary it at runtime. The parameter set by the artist is simply the number of blades that it wants to use for that lod, that many points will be used for the tile, and given the blue noise distribution even the subset of point of points are well distributed here an example of varying the numeber of blades:

![grass8](../images/23_grass/grassLOD.gif)

As of now I am using the same shader for all LOD levels but I can easily create different shader per LOD reducing the geometry created. Another good tip from Freek was to only render the tips of the blade for lower LOD level which was something I did not think of!

# What about art direction
I am quite happy with the result but how do you art direct it? Tiles are cool but makes for a very uniform grass. Which might work in some situation, in other you might want to reduce the density based on texture or have it fade out when reaching a forest or a dirt road. I have few ideas in how to go about it.

## Binary search
I could use different tile distribution, not a grid that would allow me to kill easily entire tiles but that is not granular enough. I would really need variable number of points per tile.
The challenge would be figuring out to which tile/blade the ```gl_GlobalInvocationID.x``` maps to. I could use the result scan array to search for the corresponding slot, which would tell me the index of the tile to sample and how many points I have in that tile. Being a sorted array  binary search would work well, but searching an array is highly divergent and I am not sure how performant it would be. 

## Compute blade expansion
Another option would be to expand the blades itself in the compute shader, store in a buffer and render that buffer as a single draw call. The draw back being the higher memory foot print and bandwith consumption. Of course if the grass is used in more than one pass
might very well be worth to expand it once and reuse it, if you have done any experiment in the matter I would love to hear your experience!

## Mesh shader enters the chat
The whole grass system has been thought from the ground up to be Mesh shader friendly. Culling specifically has been a big use case for it. I did not implement the mesh shader variant yet, mostly waiting for RDNA2 to do so. Mesh shading should allow for a very nice, single pass grass shader, I would be able to directly cull whole tiles, pick a corresponiding LOD and generate on demand the geometry however I see fit, varing geometry, tips only etc. No need for compute passes, draw indirect etc. I am actually looking forward to try! 

# Performance
After all this work, did any of this culling and lodding help at all?

Here below a comparison before the culling , after the culling and both culling and lodding (I hope is readable enough, if not press RMB and click on view image):

![rgp](../images/23_grass/rgp.png)

As we can see from top left image, we had half of the shader working on vertex work (green) producing no visible fragment due to most likly being out of view or being rejected by early depth. After we perform some culling we pretty much drop completely the usueles vertex only work we can see in the middle image. We can see some more fragment action but still, overdraw is killing it (way too much green here).

After we add the lodding we can see we have quite a bit less vertex work and more fragment work (blue). At each stage the overall shader got faster!

So that is it? No more VPC and raster bound? Not really.... 

***Before***

![before](../images/23_grass/before.png)

***After***
![after](../images/23_grass/after.png)

VPC is as mad as me as ever but shader is 3x faster so I am not complaining, lots more can be done on the matter but for now is fast enough and I can move to other things


# The elephant in the room
Yeah Yeah I know... MSAA... I will get to it at one point, but let us be honest, who does not like a sea of shimmering aliasing? :P


# Conclusion
This is it! This is my take on grass shader! Of course is still a proof of concept and will require much more work to be a complete tool, but for now it will do! If you have experience on the matter, suggestion, critiques or just want to discrub the topic contact me! I am always happy to nerd about graphics! My   {{<target-blank "DMs" "https://twitter.com/MGDev91">}}on Twitter are open!
