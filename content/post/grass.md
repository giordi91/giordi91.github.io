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

{{<target-blank "compiler explorer" "https://godbolt.org/z/Xbf-7u">}}

I have been hard at work on my engine, due to work and other life committment, free time was little or not existent so I had to take roughly a six month break. When I jumped back in, the love was still there and felt so motivate to work on it, I got lots done in the past month or so. The latest effort has been grass. I got to a point where I wanted to work something new rather than just porting features to Vulkan.

At a glance what I did in my grass shader was:
- Using blue noise distribution for grass blades
- Vertex plus fragment shader, no geometry shader involved. No billboards real geo per blade.
- Tile based
- GPU driven, both culling and lodding happening on GPU, indirect rendering

I will now go discussing each of this different parts in more details

# A Lodding idea
It all started when a while back (before my break) I started thinking about how would I go about 
working on a grass shader in my engine. I wanted to do something interesting potentially leveraging mesh shaders aswell. I had a fairly clear idea about using tiles for doing some GPU culling, what was not clear to me was how would I go about doing LODDing? Usually grass is very overdraw bound, and you want to limit as much as possible what you render, hence culling + lodding.

What I wanted to do was having a simple way to say, if the LOD I want requires 50% less blades, I want a simple way to grab my points, select only 50% of it and still have a good distribution, no clumping etc. I was sitting on it for a bit then it hit me, if I want to solve a distribution problem I need HIM!

![alan](../images/23_grass/alan.png)

The noise/distribution master is known as 
{{<target-blank "Alan Wolfe" "https://twitter.com/Atrix256">}}, he has been helping me since years and years now! I went to him explaining what I wanted to do and pointed out that points from a blue noise distribution respect exactly the kind of distribution I was after, not only that he linked me to one of his blog post with code I could use directly. 
I created a commanline application program able to generate tiles of such points. I generated 100 tiles of 10k points each. Took roughly 3 hours on a 6 core laptop (running on 12 threads), the code scales quadratically but being efficient was not the point here. The points are generated once and baked down to binary file. Once I had that points I could use to draw those points and just grab a subset of it if I wanted to perform LODDing.

# The first implementation

After getting a clearer idea in how I would approach things, was time to get my hands dirty. I had experience in the past about expanding geometry in vertex shaders, in particular for 
{{<target-blank "hair" "https://giordi91.github.io/post/hairexpansion/">}}, that plus the fact that usually geometry shader is frowned upon and I dont have experience with it, I decided to implement it in vertex shader aswell. As a base I used the great 
{{<target-blank "Roystan tutorial" "https://roystan.net/articles/grass-shader.html">}}, here the result:

![grass1](../images/23_grass/grass.gif)
{{< youtube jeNwKbLVg9c >}}

The initial result was not bad, in the video particularly I was showing how much of a difference using an albedo texture made compared to a simple interpolated color.
Performance was actually quite good, if I recall correclty I was rendering around 14 million vertices in around 1.5ms but take that with a grain of salt we are going to talk more about performance later.

When I shaded the initial gif, Freek Hoekstra over at LinkedIn suggested to offset sampling of the wind texture based on the UV coordindate of the blade, the higher the vertex in the blade the more offset it would get, this simple trick really improved 
the effect, have a look for yourself.
![grass3](../images/23_grass/grass3.gif)
Immediately the grass feels more of a blade than a static piece of geo rotating, I also improved a bit the wind rotations to give it a more natural look.


In case you are interest in this video I cover a bit more the tiling working, but right now is a simple proof of concept, so I am just using a simple grid:
{{< youtube _jD0piSDYL8 >}}

# GPU driven rendering
The next step was to get the GPU culling going, I started by implementing the concept of a main camera and an active camera in the engine, in this way I will be able to jump from one to the other easily 
and see if the culling is actually working. The setup is fairly basic but for now it will do. The culling shader will always use the main camera matrices to perform the culling, meanwhile for the render I will use the active camera. 

The culling happens in a compute shader, the first step is to compute a vote, informing me whether or not the tile survives the culling or not, next the surviving instances get compacted into a single array. I talk at length about the proces in this 
{{<target-blank "MPC R&D blog post" "https://www.mpc-rnd.com/unity-gpu-culling-experiments/">}}
I made a while back plus 
{{<target-blank "Kostas Anagnostou" "https://twitter.com/KostasAAA">}}
has some 
{{<target-blank "amazing" "https://www.youtube.com/watch?v=U20dIA3SLTs">}}
{{<target-blank "content" "https://interplayoflight.wordpress.com/2018/01/15/experiments-in-gpu-based-occlusion-culling-part-2-multidrawindirect-and-mesh-lodding/">}}
on culling, going in lots of details. Last time I have implemented something like this was on dx11, where wave instructions are not available if not from vendor specific extensions. Having wave instructions as first citizen made the code simpler and more efficient. Here the culling working:

![grass4](../images/23_grass/grass4.gif)

Actually the above is when culling goes wrong, in particular it is an issue on Intel IGPUs, which is currently being looked at being potentially a bug. Here the real culling working, in the below gif you can see me jumping from the main camera to active camera, the main camera frustum being rendered and matching the culled region of grass:

![grass8](../images/23_grass/grass8.gif)


# The elephant in the room
Yeah Yeah I know... MSAA... I will get to it at one point, but let us be honest, who does not like a sea of shimmering aliasing? :P
