---
date: 2020-11-13T16:34:44+00:00
linktitle: resource manager 
title: "Engine Resource Magement: a handle approach"
tags : ["engine"]
tocname: "Table of contents:"
toc : true
draft: false 
---


<p style="background:gray;padding: 1em;">
A different, hopefully better, approach to game engine resource management
</p>

![intro](../images/24_handles/handle.jpg)


<br><br>

## Intro 
Over the years I started shifting my game engine resource management to a different paradigm rather than the usual OOP. Such a paradigm is composed of a manager plus resource handles. 
I used this system in many personal projects to great success. I hope it can be useful to other people and hope to hear different ways people handle their resources too! (pun intended) 

This pattern is a combination of two main ideas:
- Instead of passing resource pointers around, you use an opaque, trivially copiable, handle.
- Instead of encapsulating a resource inside a class instance, you delegate the logic to a manager that will be in charge of allocating, manipulating, and freeing the resources.

## The handle pattern
I first came into contact with the handle idea from a chapter in the 
{{<target-blank "Game programming gems book" "https://www.amazon.co.uk/Game-Programming-Gems-CD/dp/1584500492">}}, although I did not like their implementation too much, 
it introduced me to the concept of handle and metadata to validate the handle, more on it later. 
I came across the concept again from 
{{<target-blank "this great article" "https://floooh.github.io/2018/06/17/handles-vs-pointers.html">}} by 
{{<target-blank "Andre Weissflog" "https://twitter.com/flohofwoe">}}. The blog post covers many of the advantages of handles over pointers and really resonated with me.

In my specific case the handle looks something like this:

```cpp
struct TextureHandle final {
  uint32_t handle;
  bool isHandleValid() const { return handle != 0; }
};
```

As you can see it is nothing more than a simple wrapper around the ```uint32_t```. Of course, you have full control over how big the handle is. 
In my case, I usually reserve 16 bits for an index that lets me look up the data and 16 bits of metadata for validation. 
We are going to look at how the index is used when we discuss the manager.


Let us investigate a bit more about how I use the metadata to validate my handle.

The {{<target-blank "Game programming gems book" "https://www.amazon.co.uk/Game-Programming-Gems-CD/dp/1584500492">}} 
uses the metadata portion to store a "magic number", a unique number to idenfitfy the reseource. 
When loading a resource, such a magic number is created (usually just incrementing a counter). The magic number is stored both in the metadata handle and in the data associated with the resource.
When I want to manipulate/use the resource, before performing any operation I will check if the "magic number/version" from the handle matches the one in the manager's records.
If the magic number matches, then I am sure the handle points to the correct resource.

I use some utility functions to extract the different sections from my handle:

```cpp
template <typename T>
inline uint32_t getIndexFromHandle(const T h) {
  constexpr uint32_t standardIndexMask = (1 << 16) - 1;
  return h.handle & standardIndexMask;
}
template <typename T>
inline uint32_t getMagicFromHandle(const T h) {
  constexpr uint32_t standardIndexMask = (1 << 16) - 1;
  const uint32_t standardMagicNumberMask = ~standardIndexMask;
  return (h.handle & standardMagicNumberMask) >> 16;
}
``` 

An alternative could be to use a 
{{<target-blank "structure bitfield" "https://en.cppreference.com/w/cpp/language/bit_field">}} and let
compiler generate the necessary masking/shifting. I just rolled my own years ago and never bothered to change it.

## The manager

We now know what a handle is, what it encodes, and what it represents, but how do we use it?
I paired the handle with the concept of a manager. The manager is simply an object that is in charge of all the resources of the given type. 
In the context of a texture, you would have a TextureManager.
Such a manager can load a texture from the hard drive, bind it, and more. Loading a texture might look something like this:

```cpp
TextureHandle handle = textureManager->load(pathOnDisk);
```

As you can see the function returns us a handle we can use later on to operate on the resource, as an example, to bind the texture:

```cpp
textureManager->bindTexture(handle, slot);
```

By providing the handle, the manager will know which resource to operate on. 
Let us dive a bit deeper inside the manager. For example, my Vulkan texture manager, when loading a texture will create 
a texture data structure internally:

```cpp
struct VkTexture2D {
  const char *name = nullptr;
  VkImage image;
  VkDeviceMemory deviceMemory;
  VkImageView view;
  VkDescriptorImageInfo srv{};
  VkImageLayout imageLayout;
  VkFormat format;
  uint32_t width : 16;
  uint32_t height : 16;
  uint32_t mipLevels : 16;
  uint32_t magicNumber : 16;
  uint32_t isRenderTarget : 1;
  uint32_t creationFlags : 31;
};
```

This data is all the necessary information the manager needs to perform an array of operations on the resource. (This is a fairly big structure and could be optimized by splitting the data you use at runtime from "supporting/debug data" to have better cache utilization).

### Metadata and lookup

To go from the handle to the texture data, I will need to do a lookup. The simplest solution would be to use an ```std::unordered_map``` to map the raw int of the handle to the actual ```VkTexture2D```.

Although it works just fine, I believe this looks up and checks in the map is a fairly heavy-duty operation. In my engine, I wanted something a bit more lightweight, something that could leverage the handle validation to skip extra checks and go straight to the data.  
I decided to use a simple custom memory pool, the index in the handle points directly to that memory slot used, no need to worry about hashing and hash collisions. 

### Dangling handle

By using a memory pool, slots get reused when a resource is freed and re-allocated. 
You could get in the situation where a "dangling" handle points to a slot where the original resource does not exist anymore and other data has been loaded instead. 
For example, you might have a handle pointing to slot 10 in the pool, where you expect to find an albedo texture, instead you now have a roughness texture, because the albedo texture was freed and the slot recycled.

This is where the metadata comes into play, in the ```VkTexture2D``` I store a copy of the magic number, which is compared to the handle's magic number, if the number matches you are indeed pointing to the correct resource.
As mentioned above, the magic number is nothing more than an ever-increasing counter, each time a resource is created the counter is bumped up by one. There is the possibility that the counters wrap around and you get a collision, but the possibility is so remote that I did not worry. You can always increase the handle size and use more bit for the magic number counter.

It accessing the resource is quite simple and looks something like this:
```cpp
  VkFormat getTextureFormat(const TextureHandle &handle) const {
    assertMagicNumber(handle);
    const uint32_t idx = getIndexFromHandle(handle);
    const VkTexture2D &data = m_texturePool.getConstRef(idx);
    return data.format;
  };
```

In the above function, I am using the handle to try to retrieve the texture format of the associated texture.
The assertMagicNumber() simply compares the metadata with the data in the pool. I always assert on every handle use, as soon something goes wrong the programs halts. 
The checks expand to nothing in releases unless I force them on at compile time. 
Once I know the handle is valid, I access directly the data in the pool.


![intro](https://media.tenor.com/images/fab0bbf2eb62ed8b58ff9ae70a1ec3ee/tenor.gif)

After reading all the above, you might be wondering why would I use something like that instead of simply copying a pointer around. 

I think there are several benefits to it in my opinion:

- You don't have problems of ownership, the handle can't own the data, you can cheaply copy it and not worrying about "leaks" (you still need to free the resource at one point or have logic in the manager to deallocate old data). 
You could use smart pointers but they have an overhead and they might trigger a resource deletion at any point in the frame.

- Paired with a manager, all your allocations are centralized in one place, it becomes much easier to reason about memory and how to optimize it. Once you are behind the manager interface you can easily change any aspect of memory usage and allocation,it won't affect the user (you can use a memory pool, a stack, etc for resource allocations). 
It is still possible to do a similar thing using regular OOP but it becomes very hard and clunky very quickly.

- Handles are not API specific. This pattern is the main tool I use to abstract multiple APIs (DX12 and Vk) in my engine. 
- It is very simple to implement, is not much extra work than the normal OOP approach. You could convert your OOP system fairly easily by just reshuffling some of the existing code.


## Conclusion

That is it! I hope you liked it and would love to hear from you! How do you handle your resource in your engine? What do you think of this pattern? What would you do differently or better?
You can reach me on {{<target-blank "Twitter" "https://twitter.com/MGDev91">}}. Feel free to share the post around! 

