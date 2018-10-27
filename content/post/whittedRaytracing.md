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
realtime feedback on CPU.
</p>


![whitted](../images/06_whitted/whitted.jpg)


# Introduction

Hi everyone and welcome to another post, today I would like to talk about a quick experiment I did
in Unity 2018, lately I am focusing a lot more on raytracing and decided to start from the basics.
The first seminal paper is the paper from Turne Whitted called: 
{{<target-blank "An improved illumination model for Shaded Display" "http://artis.imag.fr/Members/David.Roger/whitted.pdf">}}.

I decided to do it in Unity, for two reasons, first of all it would give me a good starting point, I would not 
need to have my own sandbox for rendering etc. Although I have one, it would have required me some more
work to get it up and running. The second reason was I wanted to keep it on CPU to make it simple, also
unity has a great new multithreading system to help me speed up the tracing. It was a win win situation.

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
allocated memory. The job system lets us use native containters but their lifetime is up to us,
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
that some memory has not been dellocated, I did not investigate if those are false positives, the 
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

Of course you still also need the update:
```c#

    public void Update()
    {
        renderIt();
        Graphics.Blit(m_BackbufferTex, outTexture);
    }
```

# The job system
In order to use the job system you will need several packages:

Packages:
* Entities
* Matematics
* ADD MISSING ONES

From the list you might have also noticed I added the Mathematics package,
this is because it allows me to use datatypes which mirrors the HLSL
one, allows to use swizzles etc, it is so nice to use. It is supposedly
work really well with the job system/ ECS.

Once you are ready to go, you are going to need to declare a new job,
I do that inside the component class. This structure is what will allow
the job system to spawn multiple tasks and execute them. I suppose
it works similarly to how TBB (and I suppose the whole thing is built
on top of TBB), where for a parallel for, you build a functor, basicall
a class, stuct with a () operator. That struct is copied many times and 
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
NativeContainer, but I highly recomend so, that is where the Burst compiler 
shine the most.
The second part is the Execute method, that is the function that is 
going to be executed in parallel on multiple thread, the job system 
will provide you with an index ***i***, which identify the "entity"
you should be processing.

A small note on native containers, the native containers allocate
memory in c++ land, as such they need to be realeased manaully, 
the garbage collector does not know about that memory and won't
manage it, which is good for us. Being memory allocated on the native side, 
it also mean that if you are doing a native plugin, you can use 
a native containter to allocate memory in c# and just toss a pointer
in the native plugin, and will be valid memory. To do so you need 
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
***WARNING: Massive over semplification of multithreading explanation
incoming***

### Granularity
When you schedule a job, you pass in a granularity (TBB term), that 
value is basically a chunk size, you might have been led to believe
that each of our entities in the job will be process on a seprated thread
as indipendent object. That is not the case, what the job system will do
is to chunk N elements toghether into a single task, in this case we 
passed a granularity of 512, the job system will split our array into
512  chunks and assign each chunk to a thread for execution. 

You might be wondering why is this the case? There are several reason
and will try my best to summarize them here. Each time you spawn a task
and you schedule it to a thread, there is an overhead, the job system 
needs to manage it and takes a bit of time to be copied to the thread and 
to get started.
If in your task you are doing a simple addition, like moving a space
shift forward in space, the total time of your execution task might be
90% multithreading overhead and 10% actual maths. In order to avoid that
the normal approach is to process a chunk of N elements to that the 
multithreading overhead is amorthized.

### How big should a task be?

At this point you might wonder, how big should a task be? Why don't 
I just make as many task as many cores/threadsI have? 

Unluckily life is not that simple, although you might have as many theads
as cores (logical or physical cores) in your thread pool, you still have no 
guarantee that the OS will schedule all of them, or they will run and complete
a task at the same time. The OS might decide to stop one thread at any
point to check if ther is an update for Word or Excel, that you absolutely
have to get, so your task will be stalled for a while, and all other thread 
will need to wait for the last stask to be done. This is called draining the 
pipeline, where some threads might be stalled waiting for the whole task to be done.
Again, the whole deal is more complex than this, with task stealing pools etc,
but this simplified model should allow you to make the right decision.

As of now we know that huge tasks and super small tasks are not idea,so how big should
a task be? There is no right answer, the right answer is: "big enough to have decent amount 
of work available withouth massive pipeline drain".

The only way to be 100% sure is to bruteforce benchmark all the sizes
and see what gives the best result, although might take a bit of time, 
you will learn with experience to "gut feeling pick" a good enough size,
don't  lose your sleep on it, if your task is doing a lot of work you might 
want a small number, 64 or so, if you are doing little work you might want
a bigger chunk. In my case 512 was working well enough.

### Memory access

The second big thing is , let say you are processing elemnt N, N+1 all the way
to N+4. The first thread gets in and loads a cache line containing object
N. The second thread might possibly do the same and load a cache line containing
N+1. This might be very inefficient since we loaded effecttively the same
cache line twice, for processing one element, if you have been following the 
whole data oriented design revolution unity is making, you might already know
that accessing elements linearly in memory is the best way to go, for several
reason, once you load a cache line, the N+1 element will be alredy in cache
and you don't need to wait a memory fetch, the processor might see your pattern
and automatically prefetch memory for you and your memory is already in cache
when you will need it. All this togheter makes a chunking approach for task 
the prefarable way of working. 

As I warned earlier all this explanation is over simplified to make it 
easily digestible, you can probalby write a blog series on this or even a book,
normally there is a lot more going on, like cache line invalidation across cores,
L3 cache shared among all the cores etc. As a rule of thumb, you want to 
access memory linearly and use 100% of the data in a cache line.

## Job handle
# Performance 









