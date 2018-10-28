---
date: 2018-10-22
linktitle: Whitted Unity 
title: "Whitted raytracer in Unity 2018"
tags : ["realtime","raytracing","cpu","unity"]
tocname: "Table of contents:"
toc : true
---

<p style="background:gray;padding: 1em;">
A simple, possibly correct, Whitted raytracer in unity, using the new Job system to get
real-time feedback on CPU.
</p>


![whitted](../images/06_whitted/whitted.jpg)


# Introduction

Hi everyone and welcome to another post, today I would like to talk about a quick experiment I did
in Unity 2018, lately I am focusing a lot more on raytracing and decided to start from the basics.
The first seminal paper is the paper from Turner Whitted called: 
{{<target-blank "An improved illumination model for Shaded Display" "http://artis.imag.fr/Members/David.Roger/whitted.pdf">}}.

I decided to do it in Unity, for two reasons, first of all it would give me a good starting point, I would not 
need to have my own sandbox for rendering etc. Although I have one, it would have required me some more
work to get it up and running. The second reason was I wanted to keep it on CPU to make it simple, also
unity has a great new multi-threading system to help me speed up the tracing. It was a win win situation.

This blog post is not going to be about the details of the 
Whitted raytracer, there is a great 
{{<target-blank "scratch pixel" "https://www.scratchapixel.com/lessons/3d-basic-rendering/ray-tracing-overview/light-transport-ray-tracing-whitted">}}.
 article about it and also the paper itself is 
fairly straight forward.

# Unity plumbing 

Before we can actually start do any kind of rendering, we need to have some plumbing going in Unity,
I started by creating a component whit some public fields on it:

![component](../images/06_whitted/component.jpg)

The component has a output render texture, a point light position , background texture and a button to kick a render.
The main idea behind the button was that when I tried to do some raymarching a couple of months ago, with the same method, it ended up being quite slow, it was hard to stop the render
so this time I wanted to have a way to kick a render and be done with it, if took minutes when it was done it would stop.

To achieve this I created a custom inspector you can see here below:

```c#
[CustomEditor(typeof(WhittedRaytracer))]
public class WhittedRaytracerEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();

        WhittedRaytracer raytracer = (WhittedRaytracer)target;
        if(GUILayout.Button("Render"))
        {
            raytracer.kickRenderToTexture();
        }
    }
}
```

The inspector would do nothing more than just call a function in the component:

```c#
    public void kickRenderToTexture()
    {
        initialize();
        renderIt();
        Graphics.Blit(m_BackbufferTex, outTexture);
        clearData();
    }
```
As you might have expected there are some simple step, initialize allocates all the memory, 
copies the background texture into an array etc. Render kicks the job system, more on this later,
then we copy the content of the render texture on the output render texture and we clean all the 
allocated memory. The job system lets us use native containers but their lifetime is up to us,
we need to release the memory manually when we are done.

The only downside is that to properly have it display and trigger when not in play mode, I need 
to set the component to execute in edit mode:

```c#
[ExecuteInEditMode]
class WhittedRaytracer: MonoBehaviour
{
    private int width;
    private int height;
	...
```

Unluckily this still gives some issues sometimes when not fired properly Unity throws some errors
that some memory has not been deallocated, I did not investigate if those are false positives, the 
start method should not be called normally, unless you recompile the component. Not ideal, but for
prototyping was more than fine.

I also wanted to have it render at runtime, to see how fast it was going. To achieve this I  just
needed to add the Whitted component on the camera, and blit the texture on the "OnRenderImage"
callback:

```c#
    void OnRenderImage(RenderTexture source, RenderTexture dest) {
            
        Graphics.Blit(outTexture, dest);
    }
```

Of course you still also need the update if you want to move the camera in 
play mode, otherwise you can omit that, and avoid all the errors:
```c#

    public void Update()
    {
        renderIt();
        Graphics.Blit(m_BackbufferTex, outTexture);
    }
```

Finaly one last bit is to copy your resulting image to a GPU texture, there
is a small trick you can do which is the following:

```c#
unsafe { m_BackbufferTex.LoadRawTextureData((IntPtr)pixels.GetUnsafeReadOnlyPtr(), pixels.Length * 16); }
m_BackbufferTex.Apply();
```

To get the unsafe pointer(more on this later), of the native container you 
need to add the using directive:

```c#
using Unity.Collections.LowLevel.Unsafe;
```
You probably also need to enable unsafe code in the Unity editor, in player
settings.


# The job system
In order to use the job system you will need several packages, this
is my manifest.json

```json
{
  "dependencies": {
    "com.unity.entities": "0.0.12-preview.18",
    "com.unity.package-manager-ui": "1.9.11",
    "com.unity.modules.imgui": "1.0.0",
    "com.unity.modules.ui": "1.0.0",
    "com.unity.modules.uielements": "1.0.0"
  }
}
```

From the list you might have also noticed I added the Mathematics package,
this is because it allows me to use datatypes which mirrors the HLSL
one, allows to use swizzels etc, it is so nice to use. It is supposedly
work really well with the job system/ ECS.

Once you are ready to go, you are going to need to declare a new job,
I do that inside the component class. This structure is what will allow
the job system to spawn multiple tasks and execute them. I suppose
it works similarly to how TBB (and I suppose the whole thing is built
on top of TBB), where for a parallel for, you build a functor, basically
a class, struct with a () operator. That struct is copied many times and 
execute on different threads, on different threads, in parallel.

Here is how you do it:

```c#
 [Unity.Burst.BurstCompile]
struct WhittedJob: IJobParallelFor
{
	// By default containers are assumed to be read & write
	public NativeArray<Color> pixels;
	[ReadOnly] public NativeArray<Color> bgpixels;

	[ReadOnly] public NativeArray<WhittedSurfaceData> implicitData;
	[ReadOnly] public Matrix4x4 cameraMatrix;
	....

	 // The code actually running on the job
	public void Execute(int i)
	{
	...
	}
}

```

This is the basic boiler plate structure you need, the struct needs
to implement the ***IJobParallelFor*** interface, and is mostly composed
of two parts.
The first part, the one that I call as the "header", is just a list 
of data that the job is going to use, not sure if you are forced to use
NativeContainer, but I highly recommend so, that is where the Burst compiler 
shine the most.
The second part is the Execute method, that is the function that is 
going to be executed in parallel on multiple thread, the job system 
will provide you with an index ***i***, which identify the "entity"
you should be processing.

A small note on native containers, the native containers allocate
memory in c++ land, as such they need to be released manually, 
the garbage collector does not know about that memory and won't
manage it, which is good for us. Being memory allocated on the native side, 
it also mean that if you are doing a native plug-in, you can use 
a native container to allocate memory in c# and just toss a pointer
in the native plug-in, and will be valid memory. To do so you need 
to disable a couple of features.

TODO EXPLAIN HOW TO GET MEMORY POINTER.

Lets get back to business after this small detour in native containers,
to kick the job you need to instantiate the job structure we defined,
pass the link to your arrays and schedule the job for execution.

```c#
        var job = new WhittedJob()
        {
            pixels = pixels,
            bgpixels = bgpixels,
            width = width,
            height = height,
            implicitData = implicitData,
            cameraMatrix = Camera.main.cameraToWorldMatrix,
            pointLight= pointLightPos,
            vFov = Camera.main.fieldOfView,
            aspect = Camera.main.aspect,
        };
		...
		JobHandle jobHandle = job.Schedule(pixels.Length, 512);
        jobHandle.Complete();
```

## A task in the job system
***WARNING: Massive over simplification of multi-threading and memory explanation
incoming***

### Granularity
When you schedule a job, you pass in a granularity (TBB term), that 
value is a chunk size, you might have been led to believe
that each of our entities in the job will be process on a separated thread
as independent. That is, however, is not the case, what the job system will do
is to chunk N elements together into a single task, in this case we 
passed a granularity of 512, the job system will split our array into
512 sized chunks and assign each chunk to a thread for execution. 

You might be wondering why is this the case? There are several factors 
and will try my best to summarize them here. 

Each time you spawn a task and you schedule it to a thread, 
there is an overhead associated with that, the job system 
needs to manage it,schedule it, copy it to the relative thread all that takes
time.
If in your task you are doing a simple addition, like moving a space
shift forward in space, the total time of your execution task might be
90% multi-threading overhead and 10% actual maths. In order to avoid that
the normal approach is to process a chunk of N elements to that the 
multi-threading overhead is amortized.

### How big should a task be?

At this point you might wonder, how big should a task be? Why don't 
I just make as many task as many cores/threadsI have? 

Unluckily life is not that simple, although you might have as many threads
as cores (logical or physical cores) in your thread pool, you still have no 
guarantee that the OS will schedule all of them, or they will run and complete
a task at the same time. The OS might decide to stop one thread at any
point to check if there is an update for Word or Excel, that you absolutely
have to get, your task will be stalled for a while, and all other thread 
will need to wait for the last task to be done. This is called draining the 
pipeline, where some threads might be stalled waiting for the whole task to be done.
Again, the whole deal is more complex than this, with task stealing pools etc,
but this simplified model should allow you to make the right decision.

As of now we know that huge tasks and super small tasks are not idea,so how big should
a task be? There is no right answer, the right answer is: "big enough to have decent amount 
of work available without massive pipeline drain".

The only way to be 100% sure to pick the best value is to brute-force 
benchmark all the sizes and see what gives the best result, although might take a bit of time, 
you will learn with experience to "gut feeling pick" a good enough size,
don't  lose your sleep on it, if your task is doing a lot of work you might 
want a small number, 64 or so, if you are doing little work you might want
a bigger chunk. In my case 512 was working well enough.

On GPU this is more important, and often people brute force the block size,
timing it and getting the one that yield best result for their problem size.
Although on GPU you only benchmark power of two between 8 to 1024 usually.

### Memory access

Another big factor is memory accesses. Let say you are processing element N, 
N+1 all the way to N+4. The first thread gets in and loads a cache line containing object
N. The second thread might possibly do the same and load a cache line containing
N+1. This might be very inefficient since we loaded effectively the same
cache line twice (and corresponding cache miss), for processing one element, if you have been following the 
whole data oriented design revolution unity is making, you might already know
that accessing elements linearly in memory is the best way to go, for several
reason. Once you load a cache line, the N+1 element will be already in cache
and you don't need to wait a memory fetch, the processor might see your pattern
and automatically pre-fetch memory for you and your memory is already in cache
when you will need it. All this together makes a chunking approach for task 
the preferable way of working. 

As I warned earlier all this explanation is over simplified to make it 
easily digestible, you can probably write a blog series on this or even a book,
normally there is a lot more going on, like cache line invalidation across cores,
L3 cache shared among all the cores etc. As a rule of thumb, you want to 
access memory linearly and use 100% of the data in a cache line.

## Job handle

Back to our job we scheduled, as you might have noticed we got back a handle
from unity, that handle is used for several things, Unity uses it internally
to track data dependencies. On the user side that handle is used to check that
the job has completed. The Unity suggestion is to schedule early
close late. This mean you should not force the job to finish immediately after
you scheduled, you should maybe do that in late update or even the next frame,
the first thing you check at the beginning update is that the previous frame
is done and then you move on as usual to schedule the new job.

# Performance 

For now I won't be sharing my code, first of all I am not 100% sure the code
is correct, as you can see from the image the first ball feels like solid 
glass, instead of thing glass. By talking to some colleagues and friends,
thin materials are always hard to deal with and often involves tricks.

Either way this won't stop me in talking a little bit about performance and how
the Unity Job system is performing. I love the job system, but the fact that
job system is handing the multi-threading + AVX, and c# doesn't allow me to 
disassemble to see the instructions, a lot of the fun in optimizing is gone 
(to note that Burst, does let you see all the disassembly you might want, even
C# IR, LLVM IR, machine code etc, it is just hard to act on it afterwards.)

Here below a gif of the raytracer in action:

![whitted2](../images/06_whitted/whitted.gif)

In the GIF we can see that my 8700k (OCed to 5.0 ghz), is being stressed 
quite well on all 12 threads, by looking at the performance we get also 
a whopping 82~ FPS!! 

My next question to the user would be where do you think the bulk of 
the performance is coming from? Multi-threading or else?

You might have seen me mentioning the burst compiler, in case you did not
know, burst is the new unity c# compiler, where the team has imbued as much
unity knowledge as possible into the compiler to try to extract as much
speed as they can from the code which gets compiled to native, it works really
well with ECS too.

In my specific case we get this rough timing:

Timings:
* Multi-threading : 2.3-2.6 FPS
* Multi-threading + Burst: 82~ FPS

As you can see the real hero right now is the burst compiler, it can 
squeeze so much extra performance from the code that is not even funny,
the reason why I think is the case, (some guessing involved, I might be wrong),
is because unless you use burst, your code is not going native, so you might
still get garbage collector issues and general c# slowdown. The code is 
also going recursive, which doesn't really put me at ease too much in c#.
Finally Burst is also able to go wide with AVX, I checked the disassembly 
and there are tons of AVX/AVX2 instructions.

Now you might understand my excitement when I wanted to try this on a Ryzen
2700x, 8 cores 16 threads, not over-clocked (yet). Some weird result were up,
mostly it was not able to saturate the CPU, I would only get around 62% overall 
utilization, although still getting faster FPS, around 90, which is impressive
since when all cores are doing work the cpu clocks at around 4.03 ghz.

To try to figure out what was up, I had a look at the profiler, Nothing weird
as far as I could see, only the copy of the texture was taking a bit of time
so I tried to remove that, I got around 100 FPS and 70% utilization.

The reason why I was expecting 100% utilization is because  there is not a frame
limiter in Unity, so even if one frame was not enough to saturate the cpu,
i would expect one frame after the other to be able to do so. Of course, is 
naive of me to think so, after all the rest of the unity frame is still running
so there might be other bottlenecks around.

Next I would like to try to add some soft shadows, that would allow me to 
to shoot a lot more rays and trying to have a heavier frame. I will also 
try to have a bigger frame to render and make the spheres much bigger, so to
generate a lot more work for the CPU and see what I get!

That is it for now!





