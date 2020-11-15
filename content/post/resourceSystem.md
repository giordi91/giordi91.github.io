---
date: 2020-11-13T16:34:44+00:00
linktitle: resource manager 
title: "Engine Resource Magement: a handle approach"
tags : ["engine"]
tocname: "Table of contents:"
toc : true
draft: true
---

<p style="background:gray;padding: 1em;">
A different, hopefully better, approach to game engine resource management
</p>

![intro](../images/24_handles/handle.jpg)


<br><br>

# Intro 
Over the years I started shifting to a different paradigm, which is a combination of a manager plus resource handles. I used this system in many personal project to great success. I hope it can be useful to other people and hope to hear different ways people handle resources too! 

This pattern is a combination of two main ideas:
- Instead of passing resource pointers around, you use an opaque, trivially copiable, handle
- Instead of encapsulating a resource inside a class instance, you delegate the logic to a manager that will be in charge of allocating, manipulating and freeing the resources

# The handle pattern
I first came into contact with the handle idea from a chapter in the 
{{<target-blank "Game programming gems book" "https://www.amazon.co.uk/Game-Programming-Gems-CD/dp/1584500492">}}, altough I did not like their implementation too much, 
it introduced me to the concept of handle and metadata to validate the handle, more on it later. I came across the concept again from 
this great article from 
{{<target-blank "this great article" "https://floooh.github.io/2018/06/17/handles-vs-pointers.html">}} from
{{<target-blank "Andre Weissflog" "https://twitter.com/flohofwoe">}}. The blog post covers many of the advantages of handles over pointers and really resonated with me.

In my specific case the handle looks something like this:

```cpp
struct TextureHandle final {
  uint32_t handle;
  [[nodiscard]] bool isHandleValid() const { return handle != 0; }
};
```

As you can see it is nothing more than a simple wrapper around the ```uint32_t```. Of course you have full control over how big the handle is. In my case most of the time I reserve 
16 bits for an index that lets me look up the data and 16 bits for metadata to let me validate the resource. We are going to look at how the index is used in the manager section of the post.
Let us investigate a bit more how I use the metadata to validate my handle.

The {{<target-blank "Game programming gems book" "https://www.amazon.co.uk/Game-Programming-Gems-CD/dp/1584500492">}} uses the metadata to store a "magic number" a unique number to idenfitfy the reseource. When I want to manipulate/use the resource before doing anything I will make sure the the "magic number/version" matches my records, at least I am 100% sure the handle points to the indended resource.

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

Another possible solution could be to simply use a 
{{<target-blank "structure bitfield" "https://en.cppreference.com/w/cpp/language/bit_field">}} 
compiler generate the necessary masking/shifting.

# The manager

We know what a handle is, what it encodes and what it represents,but how do we actually use it?
I paired the handle with the concept of a manager. The manager is simply an entity that is in charge of all the resources of the given type, in the context of a texture, you would have a TextureManager.
Such manager would be able to load from disc bind and more, for example loading the texture might look like this:

```cpp
TextureHandle h = textureManager->load(pathOnDisk);
```

as you can see the function returns us a handle we can use later on, as an example, for binding the texture:

```cpp
textureManager->bindTexture(albedoHandle, slot);
```

By passing the handle the manager will know which resource to bind. Let us dive a bit deeper inside the manager. For example my Vulkan texture manager, internally when loading a texture will create 
a texture data structure:

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

This data, is all the necessary information the manager need to perform an array of operations on the resource. (This could potentially be optimized to split the data you use at runtime with "supporting/debug data" to have potentially better cache utilization).

To go from the handle to this data, I will need to do a look up. The simplest solution would be to use an ```std::unordered_map``` to map the raw int of the handle to the actual ```VkTexture2D```,
and that is what I did right in the beginnig when I was experimenting, but in the long run I purged the stl from my engine (mostly) both as an exercise to implment containers etc myself and to try to keep compile times a bit in check.

A better solution would be to have a container that can perform better when it comes to the look up. I decided to use a simple custom memory pool, the index in the handle points directly to that memory slot, so no need to worry about hashing and hash collisions. Of course being a memory pool, slots get reused when a resource is freed. You could get in the situation where a "dangling" handle points to a slot where a resource does not exists anymore and other data has been loaded inthere. For example you might have a handle pointing to slot 10, where you expect to find an albedo texture, instead you now have a roughness texture.

This is where the metadata comes into play, as you can see, in the texture structure I store the corresponding magic number which is compared to the handle magic number, if the number matches you are indeed pointing to the correct resource.

It looks something like this:
```cpp
  VkFormat getTextureFormat(const TextureHandle &handle) const {
    assertMagicNumber(handle);
    const uint32_t idx = getIndexFromHandle(handle);
    const VkTexture2D &data = m_texturePool.getConstRef(idx);
    return data.format;
  };
```

Where assert magic number simply compares the metadata with the data in the pool. I always assert on every handle use it either crashes or it works :D I don't perform those checks in releases unless I force them on at compile time.


# Why is it better?


![intro](https://media.tenor.com/images/fab0bbf2eb62ed8b58ff9ae70a1ec3ee/tenor.gif)

After reading all this you might be wondering why would I use something like that instead of simply copying a pointer around. I think there are several benefits to it in my opinion.

- You don't have problems of ownership, the handle can't own the data, you can cheaply copy it and not worrying about "leaking data". You could use smart pointers but they have an overhead cost and they might trigger a resource deletion at any point in the frame.

- Paired with a manager, all your allocations are centralized in one place, it becomes much easier to reason about memory and how to optimize it. For example once you are behind the manger interface you can easily change any aspect of memory usage and won't affect the user (you can use a pool, stack etc for resources). You could still do a similar thing using regualr OOP but it becomes very hard and clucnky very quickly.

- Handles are not API specifics. This patter is the main pattern I use to abstract multiple APIs (dx12 and vk) in my engine. 
- It is very simple to implement, is really not much extra work than  normal OOP approach. You could convert your OOP system fairly easily by just reshuffling some the same code.

- If required in some hot paths, you can extract the some of data and bypass the lookups from the handle. I try not to do it since the look-ups are quite trivial and fast but in case, the option is there.


# Conclusion

That is it! I hope you liked and would love to hear from you in how you hand your resource, what you think of this patter, what would you do diffrently, better etc.

You can reach me on {{<target-blank "Twitter" "https://twitter.com/MGDev91">}}. Feel free to share the post around :D

